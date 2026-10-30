import { config } from "../config.js";
import { verifyAccessToken } from "./tokens.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolvedIdentity {
  userId: string;
  authenticated: boolean;
  /** "app" = token minted by this API, "demo" = seeded fallback. */
  source?: "app" | "demo";
}

export class UnauthorizedError extends Error {
  constructor(message = "UNAUTHORIZED") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolves a request to a local user.
 *
 * The API only accepts tokens it minted itself at /v1/auth. Clients get those
 * tokens by exchanging credentials or a provider ID token with the backend, and
 * never talk to Neon Auth directly.
 */
export async function resolveIdentity(input: {
  authorization?: string | null;
  headerUserId?: string | null;
}): Promise<ResolvedIdentity> {
  const authorization = input.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;

  if (token) {
    const identity = await verifyAccessToken(token);
    if (!identity) throw new UnauthorizedError();
    return { ...identity, authenticated: true, source: "app" };
  }

  if (config.DEMO_MODE) {
    const candidate =
      config.NODE_ENV === "production" ? undefined : input.headerUserId;
    return {
      userId:
        candidate && uuidPattern.test(candidate)
          ? candidate
          : config.DEMO_USER_ID,
      authenticated: false,
      source: "demo",
    };
  }

  throw new UnauthorizedError();
}
