import { SignJWT, importPKCS8 } from "jose";
import { decryptToken, envCredential } from "./secrets.js";
import type {
  PushAdapter,
  PushDevice,
  PushMessage,
  PushProvider,
  PushResult,
} from "./types.js";

/**
 * Provider adapters.
 *
 * An adapter is "configured" only if its own credentials exist in the
 * environment. Otherwise it is a dry run: the call returns `outcome: "dry-run"`
 * and no network request is made. No credential is ever invented, logged or
 * returned to an API client.
 */
class DryRunAdapter implements PushAdapter {
  constructor(
    readonly provider: PushProvider,
    private readonly reason = "provider credentials not configured",
  ) {}

  isConfigured(): boolean {
    return false;
  }

  async send(
    _device?: PushDevice,
    _message?: PushMessage,
  ): Promise<PushResult> {
    return { provider: this.provider, outcome: "dry-run", reason: this.reason };
  }
}

async function postJson(
  provider: PushProvider,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<PushResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      // Only the status is retained: an upstream error body can echo the
      // token or an authorization header.
      return {
        provider,
        outcome: "failed",
        reason: `provider responded ${response.status}`,
      };
    }
    return { provider, outcome: "sent" };
  } catch {
    return { provider, outcome: "failed", reason: "provider request failed" };
  }
}

function deliveryToken(device: PushDevice): string | null {
  return device.tokenCiphertext ? decryptToken(device.tokenCiphertext) : null;
}

/** Firebase Cloud Messaging (HTTP v1, OAuth2 service-account JWT). */
class FcmAdapter extends DryRunAdapter {
  constructor() {
    super("fcm");
  }

  override isConfigured(): boolean {
    return Boolean(
      envCredential("FCM_PROJECT_ID") &&
        envCredential("FCM_CLIENT_EMAIL") &&
        envCredential("FCM_PRIVATE_KEY"),
    );
  }

  override async send(
    device: PushDevice,
    message: PushMessage,
  ): Promise<PushResult> {
    const token = deliveryToken(device);
    if (!token || !this.isConfigured()) return super.send();
    const projectId = envCredential("FCM_PROJECT_ID");
    const clientEmail = envCredential("FCM_CLIENT_EMAIL");
    const pem = envCredential("FCM_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !pem) return super.send();

    try {
      const key = await importPKCS8(pem, "RS256");
      const assertion = await new SignJWT({
        scope: "https://www.googleapis.com/auth/firebase.messaging",
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(clientEmail)
        .setAudience("https://oauth2.googleapis.com/token")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);
      const oauth = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!oauth.ok) {
        return { provider: "fcm", outcome: "failed", reason: "oauth failed" };
      }
      const granted = (await oauth.json()) as { access_token?: string };
      if (!granted.access_token) {
        return { provider: "fcm", outcome: "failed", reason: "oauth failed" };
      }
      const endpoint =
        envCredential("FCM_ENDPOINT") ??
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
      return await postJson(
        "fcm",
        endpoint,
        { authorization: `Bearer ${granted.access_token}`, "content-type": "application/json" },
        {
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
          },
        },
      );
    } catch {
      return { provider: "fcm", outcome: "failed", reason: "provider request failed" };
    }
  }
}

/** Apple Push Notification service (token-based authentication). */
class ApnsAdapter extends DryRunAdapter {
  constructor() {
    super("apns");
  }

  override isConfigured(): boolean {
    return Boolean(
      envCredential("APNS_TEAM_ID") &&
        envCredential("APNS_KEY_ID") &&
        envCredential("APNS_PRIVATE_KEY") &&
        envCredential("APNS_TOPIC"),
    );
  }

  override async send(
    device: PushDevice,
    message: PushMessage,
  ): Promise<PushResult> {
    const token = deliveryToken(device);
    if (!token || !this.isConfigured()) return super.send();
    const teamId = envCredential("APNS_TEAM_ID");
    const keyId = envCredential("APNS_KEY_ID");
    const pem = envCredential("APNS_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    const topic = envCredential("APNS_TOPIC");
    if (!teamId || !keyId || !pem || !topic) return super.send();

    try {
      const key = await importPKCS8(pem, "ES256");
      const bearer = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: keyId })
        .setIssuer(teamId)
        .setIssuedAt()
        .sign(key);
      const endpoint =
        envCredential("APNS_ENDPOINT") ??
        `https://api.push.apple.com/3/device/${encodeURIComponent(token)}`;
      return await postJson(
        "apns",
        endpoint,
        {
          authorization: `bearer ${bearer}`,
          "apns-topic": topic,
          "apns-push-type": "alert",
          "apns-expiration": "0",
          "content-type": "application/json",
        },
        { aps: { alert: { title: message.title, body: message.body } } },
      );
    } catch {
      return { provider: "apns", outcome: "failed", reason: "provider request failed" };
    }
  }
}

/**
 * Huawei and Samsung use a bearer token issued out of band. Their endpoint
 * (and, for Samsung, the app id) is environment-configured so a deployment can
 * pin the correct regional API without a code change.
 */
class BearerPushAdapter extends DryRunAdapter {
  constructor(
    provider: Extract<PushProvider, "huawei" | "samsung">,
    private readonly tokenVariable: string,
    private readonly endpointVariable: string,
    private readonly appIdVariable?: string,
  ) {
    super(
      provider,
      `${tokenVariable} / ${endpointVariable} not configured`,
    );
  }

  override isConfigured(): boolean {
    return Boolean(
      envCredential(this.tokenVariable) && envCredential(this.endpointVariable),
    );
  }

  override async send(
    device: PushDevice,
    message: PushMessage,
  ): Promise<PushResult> {
    const token = deliveryToken(device);
    const accessToken = envCredential(this.tokenVariable);
    const endpoint = envCredential(this.endpointVariable);
    if (!token || !accessToken || !endpoint) return super.send();
    const appId = this.appIdVariable
      ? envCredential(this.appIdVariable)
      : null;
    return postJson(
      this.provider,
      endpoint,
      {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      {
        ...(appId ? { appId } : {}),
        token,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
      },
    );
  }
}

export type PushRegistry = Record<PushProvider, PushAdapter>;

/** Builds the four-provider registry. Safe to call with an empty environment. */
export function createPushRegistry(): PushRegistry {
  return {
    fcm: new FcmAdapter(),
    apns: new ApnsAdapter(),
    huawei: new BearerPushAdapter(
      "huawei",
      "HUAWEI_PUSH_ACCESS_TOKEN",
      "HUAWEI_PUSH_ENDPOINT",
      "HUAWEI_PUSH_APP_ID",
    ),
    samsung: new BearerPushAdapter(
      "samsung",
      "SAMSUNG_PUSH_ACCESS_TOKEN",
      "SAMSUNG_PUSH_ENDPOINT",
      "SAMSUNG_PUSH_APP_ID",
    ),
  };
}

let registry: PushRegistry | null = null;

export function pushRegistry(): PushRegistry {
  registry ??= createPushRegistry();
  return registry;
}
