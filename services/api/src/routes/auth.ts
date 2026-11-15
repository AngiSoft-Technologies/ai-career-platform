import {
  Router,
  type NextFunction,
  type Request as ExpressRequest,
  type Response,
} from "express";
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
import { claimHandoffCode, createHandoffCode } from "../auth/handoff.js";
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
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getUserPermissions, getUserRoles } from "../services/rbac/index.js";
import {
  exchangeCodeForToken,
  fetchLinkedInProfile,
  getLinkedInAuthUrl,
  isLinkedInConfigured,
  mapLinkedInToResume,
} from "../auth/providers/linkedin.js";
import { importLinkedInByUrl } from "../services/documents/linkedin-import.js";
import { generateDocumentFromProfile } from "../services/documents.js";
import { runAtsVerification } from "../services/documents/ats-agent.js";
import { query } from "../db/pool.js";

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

/**
 * Answers a rate limit with something a person can act on.
 *
 * The default answer is a line of plain text, which the browser sees as a
 * failed request and cannot explain. This one says what happened and how
 * long to wait.
 */
function tooManyRequests(
  _request: ExpressRequest,
  response: Response,
  _next: NextFunction,
): void {
  const retryAfter = Number(response.getHeader("Retry-After") ?? "60");
  noStore(response);
  response.status(429).json({
    error: "Too many sign-in attempts",
    code: "RATE_LIMITED",
    retry_after_seconds: Number.isFinite(retryAfter) ? retryAfter : 60,
  });
}

/**
 * The provider relay carries the calls a sign-in needs: a session check, the
 * sign-in request, the step to the provider, and the resume. Those are four
 * calls for one sign-in, and the session check also happens on ordinary page
 * loads.
 *
 * Counting all of them against one budget of ten a quarter of an hour was a
 * limit on the *traffic*, not on the attempts, and it answered 429 to people
 * who had done nothing wrong. The two buckets below are separate: the relay
 * as a whole has room, and the calls that actually start a sign-in have their
 * own, tighter budget.
 */
const neonRelayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
  // A session check is not an attempt. It happens on every page load and on
  // every sign-in, so counting it against a sign-in budget punishes people
  // for using the app.
  skip: (request) => request.path.endsWith("/get-session"),
});

const neonSignInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
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

/**
 * Starting a sign-in is not an attempt to guess a credential, and on a
 * shared mobile connection many people can share one address. It gets its
 * own budget, generous enough that nobody meets it by trying to sign in.
 */
const googleStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

/**
 * Redeeming a handoff code is the last step of a sign-in, so it gets its own
 * budget rather than sharing the refresh limiter's: a failed redemption means
 * a broken client or somebody replaying a code they already spent, and both
 * should be cheap to refuse.
 */
const exchangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests,
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

const handoffSchema = z.object({
  code: z.string().min(20).max(512),
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

/**
 * Redeems a handoff code for a session.
 *
 * This is where a social sign-in actually becomes a session: the callback
 * proved who the user is and left a single-use code behind, and the client
 * trades that code for tokens. The tokens are minted here rather than at the
 * callback, so a sign-in that is never completed leaves no refresh token
 * behind at all.
 */
authRouter.post(
  "/exchange",
  exchangeLimiter,
  async (request, response, next) => {
    try {
      const input = handoffSchema.parse(request.body ?? {});
      const claimed = await claimHandoffCode(input.code);

      if (!claimed) {
        noStore(response);
        response.status(400).json({
          error: "That sign-in link has expired. Please try again.",
          code: "HANDOFF_EXPIRED",
        });
        return;
      }

      const user = await getAuthUser(claimed.userId);
      if (!user) {
        await revokeUserSessions(claimed.userId);
        noStore(response);
        response
          .status(401)
          .json({ error: "Account is no longer active", code: "ACCOUNT_DISABLED" });
        return;
      }

      const refresh = await issueRefreshToken(claimed.userId, requestMeta(request));

      await recordAuthEvent({
        userId: claimed.userId,
        action: "auth.exchange",
        outcome: "success",
        ...requestMeta(request),
      });

      noStore(response);
      response.json(await sessionPayload(claimed.userId, refresh));
    } catch (error) {
      if (sendAuthError(response, error)) return;
      next(error);
    }
  },
);

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
authRouter.get("/google/start", googleStartLimiter, async (request, response, next) => {
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
 * mboqara account.
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
 * Completes the Google sign-in flow and hands the session back to the app.
 *
 * The browser is sent back with a *handoff code* rather than with the
 * tokens. The code is single use, lives for two minutes and carries no
 * privilege on its own; the app exchanges it for the session at
 * `POST /v1/auth/exchange`. A token in the URL fragment was never sent to a
 * server, but it did sit in the address bar for as long as the page was
 * open, and a refresh token lives for thirty days.
 *
 * The code still travels in the fragment rather than the query string, so
 * it is not in the server access log of the app either.
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

      await recordAuthEvent({
        userId,
        action: "auth.google",
        outcome: "success",
        ...requestMeta(request),
      });

      const handoff = await createHandoffCode(userId, GOOGLE_PROVIDER);
      const fragment = new URLSearchParams({ code: handoff });

      noStore(response);
      response.redirect(302, `${appRedirectUri}#${fragment.toString()}`);
    } catch (error) {
      await recordAuthEvent({
        action: "auth.google",
        outcome: "failure",
        code:
          error instanceof AuthProviderError || error instanceof AuthTokenError
            ? error.code
            : null,
        ...requestMeta(request),
      });

      // A failed sign-in must not dead-end. The browser is sent back to
      // the app's sign-in page with a code it can explain, so a visitor
      // who declines consent, takes longer than the state's ten minutes,
      // or hits a provider error gets a page that says what happened and
      // offers the button again — instead of a bare status page with no
      // way forward, which is how a failure turns into a loop.
      const failure = appFailureRedirect(error);
      if (failure) {
        response.redirect(302, failure);
        return;
      }
      next(error);
    }
  },
);

/**
 * Where a failed Google sign-in should land the browser.
 *
 * The sign-in page carries the code and says what happened.
 */
function appFailureRedirect(error: unknown): string | null {
  const base = (config.WEB_ORIGIN ?? "").split(",")[0]?.trim();
  if (!base) return null;
  const code =
    error instanceof AuthProviderError || error instanceof AuthTokenError
      ? error.code
      : "SIGN_IN_FAILED";
  const message =
    error instanceof Error ? error.message : "The sign-in did not complete";
  const query = new URLSearchParams({ google_error: code, reason: message });
  return `${base}/login?${query.toString()}`;
}

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
  const parsed = new URL(request.originalUrl, "http://localhost");
  const pathname = parsed.pathname
    .replace(/^\/v1\/auth\/neon\/?/, "")
    .replace(/\/+$/, "");

  if (!isAllowedNeonPath(pathname)) {
    noStore(response);
    response.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }

  // The query string is part of the request: the social sign-in carries its
  // token in one, and dropping it leaves the provider answering
  // "[query.token] Invalid input" with nothing to work from.
  const path = `${pathname}${parsed.search}`;

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

  // Each cookie has to arrive separately: the provider sets more than one
  // (the session token and the data that goes with it), and a second
  // `setHeader` for the same name replaces the first rather than adding to
  // it. The browser would then be left with half the session.
  for (const [name, value] of result.headers) {
    if (name.toLowerCase() === "set-cookie") {
      response.append(name, value);
      continue;
    }
    response.setHeader(name, value);
  }
  noStore(response);
  response.status(result.status).end(Buffer.from(result.body));
}

/**
 * The provider relay.
 *
 * Two budgets, not one: the relay itself is roomy, and the calls that start
 * or resume a sign-in have their own. They are counted separately so that
 * ordinary traffic through the relay cannot exhaust the sign-in budget, and
 * so that a sign-in cannot exhaust the relay.
 */
const NEON_SIGN_IN_PATHS = new Set([
  "sign-in/social",
  "sign-in/social/init",
  "oauth2/continue",
  "oauth2/consent",
]);

authRouter.all(
  "/neon/*path",
  neonRelayLimiter,
  (request, response, next) => {
    const path = new URL(request.originalUrl, "http://localhost").pathname
      .replace(/^\/v1\/auth\/neon\/?/, "")
      .replace(/\/+$/, "");
    if (NEON_SIGN_IN_PATHS.has(path)) {
      neonSignInLimiter(request, response, next);
      return;
    }
    next();
  },
  async (request, response, next) => {
    try {
      await relayNeon(request, response);
    } catch (error) {
      next(error);
    }
  },
);


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

/**
 * Starts the LinkedIn sign-in flow for resume import.
 */
const startLinkedInFlow = async (
  _request: unknown,
  response: Response,
  next: (error: unknown) => void,
): Promise<void> => {
  try {
    if (!isLinkedInConfigured()) {
      response.status(503).json({
        error: "LINKEDIN_NOT_CONFIGURED",
        message:
          "LinkedIn sign-in is not available yet. Upload your resume or build it manually instead.",
      });
      return;
    }
    const state = randomUUID();
    const authUrl = getLinkedInAuthUrl(state);
    noStore(response);
    response.json({ authUrl, state });
  } catch (error) {
    next(error);
  }
};

authRouter.get("/linkedin", startLinkedInFlow);
authRouter.post("/linkedin", startLinkedInFlow);

/**
 * Imports a public LinkedIn profile URL as a fallback when OAuth credentials
 * are not configured. The page is scraped and converted into a resume.
 */
authRouter.post("/linkedin/import", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    if (!userId) {
      response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    const { profileUrl } = z
      .object({ profileUrl: z.string().url() })
      .parse(request.body ?? {});
    const result = await importLinkedInByUrl({ userId, profileUrl });
    noStore(response);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Handles LinkedIn OAuth callback and imports profile as resume.
 */
authRouter.post("/linkedin/callback", async (request, response, next) => {
  try {
    const { code } = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1).optional(),
      })
      .parse(request.body ?? {});

    const userId = response.locals.userId as string;
    if (!userId) {
      noStore(response);
      response.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }

    if (!isLinkedInConfigured()) {
      response.status(503).json({ error: "LINKEDIN_NOT_CONFIGURED" });
      return;
    }

    const { access_token } = await exchangeCodeForToken(code);
    const linkedinProfile = await fetchLinkedInProfile(access_token);
    const resumeData = mapLinkedInToResume(linkedinProfile);

    await query(
      `INSERT INTO candidate_profiles (user_id, full_name, headline, email, linkedin_url, years_experience, seniority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         headline = EXCLUDED.headline,
         email = EXCLUDED.email,
         linkedin_url = EXCLUDED.linkedin_url,
         years_experience = EXCLUDED.years_experience,
         seniority = EXCLUDED.seniority`,
      [
        userId,
        resumeData.fullName,
        resumeData.headline,
        resumeData.email,
        resumeData.linkedin,
        Math.round(resumeData.yearsExperience),
        resumeData.yearsExperience >= 8
          ? "senior"
          : resumeData.yearsExperience >= 3
            ? "mid"
            : "junior",
      ],
    );

    if (resumeData.skills.length > 0) {
      await query(
        "DELETE FROM candidate_skills WHERE profile_id = (SELECT id FROM candidate_profiles WHERE user_id = $1)",
        [userId],
      );
      for (const skill of resumeData.skills.slice(0, 100)) {
        await query(
          "INSERT INTO candidate_skills (profile_id, name, level) SELECT id, $2, 'working' FROM candidate_profiles WHERE user_id = $1",
          [userId, skill],
        );
      }
    }

    const { id, document } = await generateDocumentFromProfile({
      userId,
      type: "cv",
      title: `${resumeData.fullName || "My"} Resume`,
      profileData: resumeData,
      origin: "linkedin",
    });

    void runAtsVerification({
      userId,
      documentId: id,
      content: document.content,
    }).catch(() => undefined);

    noStore(response);
    response.status(201).json({ profile: linkedinProfile, document });
  } catch (error) {
    next(error);
  }
});
