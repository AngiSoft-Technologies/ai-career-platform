import { NEON_AUTH_URL } from "./auth";

interface OAuthResponse {
  url?: string;
  redirect?: boolean;
}

export interface PublicClient {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
}

async function postOAuth(path: string, body: unknown): Promise<string | null> {
  const response = await fetch(`${NEON_AUTH_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as OAuthResponse | null;
  return typeof payload?.url === "string" ? payload.url : null;
}

export function continueAuthorization(oauthQuery: string): Promise<string | null> {
  return postOAuth("/oauth2/continue", { selected: true, oauth_query: oauthQuery });
}

export function respondToConsent(
  accept: boolean,
  oauthQuery: string,
): Promise<string | null> {
  return postOAuth("/oauth2/consent", { accept, oauth_query: oauthQuery });
}

export async function fetchPublicClient(
  clientId: string,
): Promise<PublicClient | null> {
  const response = await fetch(
    `${NEON_AUTH_URL}/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    { credentials: "include", headers: { accept: "application/json" } },
  );
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as PublicClient | null;
}

export function parseAuthorizationRequest(oauthQuery: string): {
  clientId: string;
  scopes: string[];
  resource: string;
} {
  const params = new URLSearchParams(oauthQuery);
  return {
    clientId: params.get("client_id") ?? "",
    scopes: (params.get("scope") ?? "").split(" ").filter(Boolean),
    resource: params.get("resource") ?? "",
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
