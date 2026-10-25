import { config } from "../config.js";
import { ensureLocalUser, verifyNeonToken } from "./neon-auth.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolvedIdentity {
  userId: string;
  authenticated: boolean;
}

export class UnauthorizedError extends Error {
  constructor(message = "UNAUTHORIZED") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function resolveIdentity(input: {
  authorization?: string | null;
  headerUserId?: string | null;
}): Promise<ResolvedIdentity> {
  const authorization = input.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;

  if (token) {
    const identity = await verifyNeonToken(token);
    if (!identity) throw new UnauthorizedError();
    const userId = await ensureLocalUser(identity);
    return { userId, authenticated: true };
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
    };
  }

  throw new UnauthorizedError();
}
