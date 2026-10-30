import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  getAuthUser,
  linkGoogleIdentity,
  recordAuthEvent,
  resolveGoogleUser,
} from "../auth/identities.js";
import {
  authenticatePassword,
  createPasswordAccount,
} from "../auth/credentials.js";
import {
  requestPasswordReset,
  resetPassword,
} from "../auth/password-reset.js";
import { AuthNotConfiguredError, AuthTokenError } from "../auth/tokens.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  revokeUserSessions,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type RefreshToken,
} from "../auth/tokens.js";
import { UnauthorizedError } from "../auth/resolve-identity.js";
import { verifyGoogleIdToken } from "../auth/providers/google.js";
import {
  assertRedirectAllowed,
  beginOAuthFlow,
  claimLinkTicket,
  completeOAuthFlow,
  createLinkTicket,
  GOOGLE_PROVIDER,
} from "../auth/providers/neon-oauth.js";
import {
  isAllowedNeonPath,
  relayToNeon,
} from "../auth/providers/neon-gateway.js";
import { AuthProviderError } from "../auth/providers/errors.js";
import { config } from "../config.js";
import { getUserPermissions, getUserRoles } from "../services/rbac/index.js";

export const authRouter = Router();

/**
 * Resolves the caller for the auth endpoints themselves.
 *
 * The auth router is mounted ahead of the global identity middleware because
 * these endpoints are how a client obtains a token. So it does its own
 * resolution, and only the strict kind:
 *
 *   no token        -> anonymous; the public endpoints are reachable
 *   invalid token   -> 401, the caller asked to be identified and could not be
 *   valid token     -> the caller is available to the endpoints that need one
 *
 * There is deliberately no demo fallback here. Auth is the one place where an
 * implicit identity would be a security hole: a session must be either proven
 * or absent.
 */
authRouter.use(async (request, response, next) => {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;

  if (!token) {
    next();
    return;
  }

  try {
    const identity = await verifyAccessToken(token);
    if (!identity) throw new UnauthorizedError();
    response.locals.userId = identity.userId;
    response.locals.authenticated = true;
    next();
  } catch {
    noStore(response);
    response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }
});

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const signUpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const signUpSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(120),
});

const googleSchema = z.object({
  idToken: z.string().min(20).max(8192),
  nonce: z.string().min(8).max(256).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

const signOutSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const resetSchema = z.object({
  token: z.string().min(20).max(512),
  password: z.string().min(8).max(200),
});

function requestMeta(request: {
  header: (name: string) => string | undefined;
  ip?: string;
}) {
  return {
    userAgent: request.header("user-agent") ?? null,
    ip: request.ip ?? null,
  };
}

function noStore(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}

async function sessionPayload(userId: string, refresh: RefreshToken) {
  const [access, user, roles, permissions] = await Promise.all([
    signAccessToken(userId),
    getAuthUser(userId),
    getUserRoles(userId),
    getUserPermissions(userId),
  ]);

  return {
    token: access.token,
    tokenType: "Bearer" as const,
    expiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user,
    roles: roles.map((role) => role.roleName),
    permissions,
  };
}

function sendAuthError(response: Response, error: unknown): boolean {
  if (error instanceof AuthNotConfiguredError) {
    noStore(response);
    response.status(503).json({
      error: "Authentication is not configured",
      code: "AUTH_NOT_CONFIGURED",
    });
    return true;
  }

  if (error instanceof AuthProviderError) {
    noStore(response);
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
      response.status(202).json({ error: error.message, code: error.code });
      return true;
    }
    const status =
      error.status >= 400 && error.status < 500 ? error.status : 502;
    response.status(status).json({ error: error.message, code: error.code });
    return true;
  }

  if (error instanceof AuthTokenError) {
    noStore(response);
    response.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }

  return false;
}

authRouter.post("/sign-up", signUpLimiter, async (request, response, next) => {
  try {
    const input = signUpSchema.parse(request.body ?? {});
    const meta = requestMeta(request);

    const userId = await createPasswordAccount({
      email: input.email,
      password: input.password,
      name: input.name,
    });
    const refresh = await issueRefreshToken(userId, meta);

    await recordAuthEvent({
      userId,
      action: "auth.sign_up",
      outcome: "success",
      ...meta,
    });

    noStore(response);
    response.status(201).json(await sessionPayload(userId, refresh));
  } catch (error) {
    if (sendAuthError(response, error)) {
      await recordAuthEvent({
        action: "auth.sign_up",
        outcome: "failure",
        code:
          error instanceof AuthProviderError || error instanceof AuthTokenError
            ? error.code
            : null,
        ...requestMeta(request),
      });
      return;
    }
    await recordAuthEvent({
      action: "auth.sign_up",
      outcome: "failure",
      code: "INTERNAL",
      ...requestMeta(request),
    });
    next(error);
  }
});

authRouter.post("/sign-in", signInLimiter, async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body ?? {});
    const meta = requestMeta(request);

    const userId = await authenticatePassword({
      email: input.email,
      password: input.password,
    });
    const refresh = await issueRefreshToken(userId, meta);

    await recordAuthEvent({
      userId,
      action: "auth.sign_in",
      outcome: "success",
      ...meta,
    });

    noStore(response);
    response.json(await sessionPayload(userId, refresh));
  } catch (error) {
    if (sendAuthError(response, error)) {
      await recordAuthEvent({
        action: "auth.sign_in",
        outcome: "failure",
        code: error instanceof AuthProviderError ? error.code : null,
        ...requestMeta(request),
      });
      return;
    }
    next(error);
  }
});

authRouter.post("/google", googleLimiter, async (request, response, next) => {
  try {
    const input = googleSchema.parse(request.body ?? {});
    const meta = requestMeta(request);

    const identity = await verifyGoogleIdToken(input.idToken, input.nonce);
    const userId = await resolveGoogleUser(identity);
    const refresh = await issueRefreshToken(userId, meta);

    await recordAuthEvent({
      userId,
      action: "auth.google",
      outcome: "success",
      ...meta,
    });

    noStore(response);
    response.json(await sessionPayload(userId, refresh));
  } catch (error) {
    if (sendAuthError(response, error)) {
      await recordAuthEvent({
        action: "auth.google",
        outcome: "failure",
        code: error instanceof AuthProviderError ? error.code : null,
        ...requestMeta(request),
      });
      return;
    }
    next(error);
  }
});

authRouter.post("/refresh", refreshLimiter, async (request, response, next) => {
  try {
    const input = refreshSchema.parse(request.body ?? {});
    const rotated = await rotateRefreshToken(
      input.refreshToken,
      requestMeta(request),
    );

    const user = await getAuthUser(rotated.userId);
    if (!user) {
      await revokeUserSessions(rotated.userId);
      noStore(response);
      response
        .status(401)
        .json({ error: "Account is no longer active", code: "ACCOUNT_DISABLED" });
      return;
    }

    noStore(response);
    response.json(await sessionPayload(rotated.userId, rotated.refresh));
  } catch (error) {
    if (sendAuthError(response, error)) return;
    if (
      error instanceof AuthTokenError &&
      (error.code === "TOKEN_INVALID" ||
        error.code === "TOKEN_EXPIRED" ||
        error.code === "TOKEN_REUSED")
    ) {
      await recordAuthEvent({
        action: "auth.refresh",
        outcome: "failure",
        code: error.code,
        ...requestMeta(request),
      });
    }
    next(error);
  }
});

authRouter.post("/sign-out", async (request, response, next) => {
  try {
    const input = signOutSchema.parse(request.body ?? {});
    if (input.refreshToken) {
      await revokeRefreshToken(input.refreshToken);
    }
    noStore(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * Starts a password reset.
 *
 * The response is the same whether or not the address exists, so the endpoint
 * cannot be used to discover accounts.
 */
authRouter.post(
  "/password/reset-request",
  signInLimiter,
  async (request, response, next) => {
    try {
      const input = resetRequestSchema.parse(request.body ?? {});
      await requestPasswordReset({ email: input.email });
      noStore(response);
      response.status(202).json({
        message: "If that address has an account, a reset link is on its way.",
      });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      next(error);
    }
  },
);

/** Completes a password reset and signs the user in. */
authRouter.post(
  "/password/reset",
  signInLimiter,
  async (request, response, next) => {
    try {
      const input = resetSchema.parse(request.body ?? {});
      const userId = await resetPassword(input);
      const refresh = await issueRefreshToken(userId, requestMeta(request));

      await recordAuthEvent({
        userId,
        action: "auth.password.reset",
        outcome: "success",
        ...requestMeta(request),
      });

      noStore(response);
      response.json(await sessionPayload(userId, refresh));
    } catch (error) {
      if (sendAuthError(response, error)) {
        await recordAuthEvent({
          action: "auth.password.reset",
          outcome: "failure",
          code:
            error instanceof AuthProviderError || error instanceof AuthTokenError
              ? error.code
              : null,
          ...requestMeta(request),
        });
        return;
      }
      next(error);
    }
  },
);

/**
 * Starts the Google sign-in flow.
 *
 * The browser is redirected to the identity provider, which runs the Google
 * consent screen. Neither the web app nor the mobile app ever contacts Google
 * or the provider directly.
 */
authRouter.get("/google/start", googleLimiter, async (request, response, next) => {
  try {
    const redirectUri = z
      .string()
      .min(1)
      .max(2048)
      .parse(request.query.redirect_uri);

    assertRedirectAllowed(redirectUri);

    const flow = await beginOAuthFlow({
      provider: GOOGLE_PROVIDER,
      appRedirectUri: redirectUri,
    });

    noStore(response);
    response.redirect(302, flow.authorizationUrl);
  } catch (error) {
    if (sendAuthError(response, error)) return;
    next(error);
  }
});

/**
 * Issues a single-use ticket that binds a provider sign-in to the signed-in
 * account, so the callback links the provider identity instead of creating a
 * new account.
 */
authRouter.post(
  "/google/link-ticket",
  googleLimiter,
  async (request, response, next) => {
    try {
      const userId = response.locals.userId as string | undefined;
      if (!userId) {
        noStore(response);
        response
          .status(401)
          .json({ error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }

      const ticket = await createLinkTicket(userId);
      noStore(response);
      response.json({ ticket });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      next(error);
    }
  },
);

/**
 * Starts the provider sign-in that links a provider account to an existing
 * Job Radar account.
 */
authRouter.get(
  "/google/link/start",
  googleLimiter,
  async (request, response, next) => {
    try {
      const ticket = z.string().min(10).max(256).parse(request.query.ticket);
      const redirectUri = z
        .string()
        .min(1)
        .max(2048)
        .parse(request.query.redirect_uri);

      assertRedirectAllowed(redirectUri);

      const claimed = await claimLinkTicket(ticket);
      if (!claimed) {
        throw new AuthProviderError(
          "That link request has expired. Please try again.",
          "INVALID_STATE",
          400,
        );
      }

      const flow = await beginOAuthFlow({
        provider: claimed.provider,
        appRedirectUri: redirectUri,
        linkUserId: claimed.userId,
      });

      noStore(response);
      response.redirect(302, flow.authorizationUrl);
    } catch (error) {
      if (sendAuthError(response, error)) return;
      next(error);
    }
  },
);

/**
 * Completes the Google sign-in flow and hands the tokens back to the app.
 *
 * The tokens travel in the URL fragment so they are never sent to a server,
 * logged, or stored in browser history.
 */
authRouter.get(
  "/google/callback",
  googleLimiter,
  async (request, response, next) => {
    try {
      const code = z.string().min(1).max(4096).parse(request.query.code);
      const state = z.string().min(10).max(256).parse(request.query.state);

      const { identity, appRedirectUri, mode, userId: linkUserId } =
        await completeOAuthFlow({
          code,
          state,
        });

      if (mode === "link") {
        if (!linkUserId) {
          throw new AuthProviderError(
            "That link request is no longer valid",
            "INVALID_STATE",
            400,
          );
        }
        await linkGoogleIdentity(linkUserId, identity);
        await recordAuthEvent({
          userId: linkUserId,
          action: "auth.google.link",
          outcome: "success",
          ...requestMeta(request),
        });
        noStore(response);
        response.redirect(302, `${appRedirectUri}#linked=1`);
        return;
      }

      const userId = await resolveGoogleUser(identity);
      const refresh = await issueRefreshToken(userId, requestMeta(request));
      const access = await signAccessToken(userId);

      await recordAuthEvent({
        userId,
        action: "auth.google",
        outcome: "success",
        ...requestMeta(request),
      });

      const fragment = new URLSearchParams({
        access_token: access.token,
        refresh_token: refresh.token,
        expires_at: access.expiresAt.toISOString(),
        refresh_expires_at: refresh.expiresAt.toISOString(),
      });

      noStore(response);
      response.redirect(302, `${appRedirectUri}#${fragment.toString()}`);
    } catch (error) {
      if (sendAuthError(response, error)) {
        await recordAuthEvent({
          action: "auth.google",
          outcome: "failure",
          code:
            error instanceof AuthProviderError || error instanceof AuthTokenError
              ? error.code
              : null,
          ...requestMeta(request),
        });
        return;
      }
      next(error);
    }
  },
);

/**
 * Relay to Neon Auth.
 *
 * Two steps of the social sign-in flow have to run inside the browser session
 * that Neon created: starting the provider sign-in and resuming the
 * authorization request once the provider returns. The API relays those calls
 * so the web and mobile apps never address Neon directly and never hold a
 * provider credential.
 *
 * Only the paths in the allowlist are reachable and the session cookie is
 * passed through untouched in both directions.
 */
async function relayNeon(
  request: {
    method: string;
    originalUrl: string;
    header: (name: string) => string | undefined;
    body?: unknown;
  },
  response: Response,
): Promise<void> {
  const path = new URL(request.originalUrl, "http://localhost").pathname
    .replace(/^\/v1\/auth\/neon\/?/, "")
    .replace(/\/+$/, "");

  if (!isAllowedNeonPath(path)) {
    noStore(response);
    response.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }

  const headers: Record<string, string> = {};
  const cookie = request.header("cookie");
  if (cookie) headers.cookie = cookie;
  const contentType = request.header("content-type");
  if (contentType) headers["content-type"] = contentType;
  const accept = request.header("accept");
  if (accept) headers.accept = accept;
  // The provider rejects requests without an origin, and it only accepts
  // origins it trusts. The API's own origin is always trusted.
  headers.origin = request.header("origin") ?? config.API_URL;

  const result = await relayToNeon(path, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {}),
  });

  for (const [name, value] of result.headers) {
    response.setHeader(name, value);
  }
  noStore(response);
  response.status(result.status).end(Buffer.from(result.body));
}

authRouter.all("/neon/*path", googleLimiter, async (request, response, next) => {
  try {
    await relayNeon(request, response);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/session", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string | undefined;
    const authenticated = response.locals.authenticated === true;
    if (!userId) {
      noStore(response);
      response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }

    const [user, roles, permissions] = await Promise.all([
      getAuthUser(userId),
      getUserRoles(userId),
      getUserPermissions(userId),
    ]);

    noStore(response);
    response.json({
      authenticated,
      user,
      roles: roles.map((role) => role.roleName),
      permissions,
      mode: config.DEMO_MODE && !authenticated ? "demo" : "live",
    });
  } catch (error) {
    next(error);
  }
});
