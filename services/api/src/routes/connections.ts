import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { broadcast } from "../realtime/hub.js";

export const connectionsRouter = Router();

type ProviderKey = "gmail" | "whatsapp" | "github" | "linkedin";

interface ProviderDefinition {
  key: ProviderKey;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  envPrefix: string;
  features: string[];
}

const providers: Record<ProviderKey, ProviderDefinition> = {
  gmail: {
    key: "gmail",
    label: "Gmail",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    envPrefix: "GOOGLE",
    features: ["Send application emails", "Read recruiter replies", "Sync sent mail"],
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    authorizeUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    scopes: ["whatsapp_business_messaging"],
    envPrefix: "WHATSAPP",
    features: ["Send recruiter messages", "Follow-up nudges"],
  },
  github: {
    key: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email", "repo"],
    envPrefix: "GITHUB",
    features: ["Import profile and repositories", "Verify work history"],
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile", "r_emailaddress"],
    envPrefix: "LINKEDIN",
    features: ["Import professional profile", "Detect new roles"],
  },
};

function credentialsFor(provider: ProviderDefinition): {
  clientId?: string;
  clientSecret?: string;
} {
  const env = config as unknown as Record<string, string | undefined>;
  return {
    clientId: env[`${provider.envPrefix}_CLIENT_ID`],
    clientSecret: env[`${provider.envPrefix}_CLIENT_SECRET`],
  };
}

connectionsRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const result = await query(
      `SELECT id, provider, provider_account_id, account_email, display_name,
              scopes, status, metadata, token_expires_at, created_at
         FROM user_connections
        WHERE user_id = $1
        ORDER BY created_at ASC`,
      [userId],
    );

    response.json({
      items: result.rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        accountEmail: row.account_email,
        displayName: row.display_name,
        scopes: row.scopes,
        status: row.status,
        metadata: row.metadata,
        tokenExpiresAt: row.token_expires_at,
        createdAt: row.created_at,
      })),
      providers: Object.values(providers).map((provider) => ({
        key: provider.key,
        label: provider.label,
        features: provider.features,
        configured: Boolean(credentialsFor(provider).clientId),
      })),
    });
  } catch (error) {
    next(error);
  }
});

connectionsRouter.post("/:provider/start", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const providerKey = z.enum(["gmail", "whatsapp", "github", "linkedin"]).parse(
      request.params.provider,
    );
    const provider = providers[providerKey];
    const { clientId, clientSecret } = credentialsFor(provider);

    if (!clientId || !clientSecret) {
      response.status(501).json({
        error: "PROVIDER_NOT_CONFIGURED",
        provider: providerKey,
        message: `${provider.label} OAuth credentials are not configured on the server yet. Add ${provider.envPrefix}_CLIENT_ID and ${provider.envPrefix}_CLIENT_SECRET, then reconnect.`,
      });
      return;
    }

    const state = crypto.randomUUID();
    const redirectUri = `${config.API_URL}/v1/connections/${providerKey}/callback`;

    await query(
      `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
       VALUES ('connection.oauth.started', 'user', $1, $2)`,
      [userId, JSON.stringify({ provider: providerKey, state })],
    );

    const url = new URL(provider.authorizeUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", provider.scopes.join(" "));
    url.searchParams.set("state", state);

    response.json({ authorizationUrl: url.toString(), state, redirectUri });
  } catch (error) {
    next(error);
  }
});

connectionsRouter.post("/:provider/callback", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const providerKey = z.enum(["gmail", "whatsapp", "github", "linkedin"]).parse(
      request.params.provider,
    );
    const provider = providers[providerKey];
    const { clientId, clientSecret } = credentialsFor(provider);

    if (!clientId || !clientSecret) {
      response.status(501).json({ error: "PROVIDER_NOT_CONFIGURED" });
      return;
    }

    const code = z.string().min(4).parse(request.body.code);

    const tokenResponse = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${config.API_URL}/v1/connections/${providerKey}/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      response.status(502).json({ error: "TOKEN_EXCHANGE_FAILED", provider: providerKey });
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const result = await query(
      `INSERT INTO user_connections (
         user_id, provider, provider_account_id, scopes, access_token,
         refresh_token, token_expires_at, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE SET
         scopes = EXCLUDED.scopes,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         status = 'active',
         updated_at = now()
       RETURNING id, provider, account_email, display_name, scopes, status, created_at`,
      [
        userId,
        providerKey,
        `${providerKey}:${userId}`,
        provider.scopes,
        tokens.access_token ?? null,
        tokens.refresh_token ?? null,
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ],
    );

    broadcast("connection.updated", { provider: providerKey, status: "active" }, userId);

    response.json({ connection: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

connectionsRouter.delete("/:id", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const connectionId = z.string().uuid().parse(request.params.id);

    const result = await query(
      `UPDATE user_connections
          SET access_token = NULL, refresh_token = NULL, status = 'revoked', updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, provider, status`,
      [connectionId, userId],
    );

    if (!result.rows[0]) {
      response.status(404).json({ error: "Connection not found" });
      return;
    }

    broadcast("connection.updated", { provider: result.rows[0].provider, status: "revoked" }, userId);
    response.json({ connection: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
