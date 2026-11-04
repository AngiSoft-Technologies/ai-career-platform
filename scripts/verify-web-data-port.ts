/**
 * Smoke verification for the web-data port.
 *
 * Covers the five capabilities added on top of the engine primitives:
 *
 *   1. the fetch waterfall and its re-planning
 *   2. structural change judging (noise taxonomy, fail-open suppression)
 *   3. outbound webhook signing and event filtering
 *   4. credential redaction
 *   5. the shared network guard
 *
 * Everything here is offline: no network calls, no Redis, no Postgres. The
 * checks are about behaviour that must be correct by construction, not about
 * integration.
 *
 * Run: npx tsx scripts/verify-web-data-port.ts
 */

import { readFileSync } from "node:fs";

import {
  sameCountry,
  samePlace,
} from "../services/api/src/services/geo.js";

import {
  AbortManager,
  timeoutInstance,
} from "../services/api/src/lib/abort-manager.js";import {
  AddFeatureError,
  EngineRetryableError,
  runWaterfall,
  type WaterfallEngine,
  type WaterfallMeta,
} from "../services/api/src/services/engine/waterfall.js";
import {
  changesAtLeaves,
  deepEquals,
  detectMeaningfulChange,
  judgeChangeWithLlm,
  semanticEquals,
  shouldSuppressAlert,
} from "../services/api/src/services/engine/freshness.js";
import {
  buildSignatureHeaders,
  eventMatches,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../services/api/src/services/webhooks/outbound.js";
import {
  redactError,
  redactHeaders,
  redactText,
  redactUrl,
} from "../services/api/src/lib/redact.js";
import {
  assertPublicUrl,
  isPrivateAddress,
} from "../services/api/src/lib/net-guard.js";
import {
  deriveVariantKey,
  isNegativeStillValid,
} from "../services/api/src/services/engine/cache-variant.js";
import {
  reserveBudget,
  withBudget,
} from "../services/api/src/services/engine/reservation.js";
import {
  priceCall,
  priceCallWithFallback,
} from "../services/api/src/services/engine/cost-tracking.js";
import { neonDialectUrl } from "../services/api/src/services/ai/client.js";
import { config } from "../services/api/src/config.js";

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function meta(flags: Array<"proxied" | "stealth"> = []): WaterfallMeta {
  return {
    url: "https://example.test/job",
    featureFlags: new Set(flags),
    abort: new AbortManager([timeoutInstance(5_000, "operation")]),
    slots: {},
  };
}

function engine<E>(
  name: string,
  run: (meta: WaterfallMeta) => Promise<E>,
  supports: (meta: WaterfallMeta) => boolean = () => true,
): WaterfallEngine<E> {
  return {
    engine: name,
    supports,
    run,
    maxReasonableMs: () => 1_000,
  };
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  console.log("\n[1] engine waterfall");
  // -------------------------------------------------------------------------

  const direct = engine<string>("direct", async () => "direct-result");
  const proxied = engine<string>("proxied", async () => "proxied-result");
  const winner = await runWaterfall(meta(), [direct, proxied]);
  check("fastest engine wins", winner.result === "direct-result");
  check("winning engine reported", winner.engine === "direct");
  check("one attempt needed", winner.attempts === 1);

  // Re-planning: the direct engine discovers it needs the proxy tier. The
  // engines are flag-gated so only one is planned per attempt — which is
  // exactly the situation a re-plan is for.
  let replanAttempts = 0;
  const escalating = engine<string>(
    "direct",
    async () => {
      replanAttempts += 1;
      throw new AddFeatureError(["proxied"]);
    },
    (m) => !m.featureFlags.has("proxied"),
  );
  const gatedProxy = engine<string>(
    "proxied",
    async () => "proxied-result",
    (m) => m.featureFlags.has("proxied"),
  );
  const escalated = await runWaterfall(meta(), [escalating, gatedProxy]);
  check("strategy error re-plans the waterfall", escalated.engine === "proxied");
  check("re-plan used the escalated result", escalated.result === "proxied-result");
  check("feature toggle counted", escalated.featureToggles === 1);
  check("two attempts were made", replanAttempts === 1 && escalated.attempts === 2);

  // Concurrency: when both engines are planned at once, the first success
  // wins immediately and the loser is cancelled rather than waited for.
  const slow = engine<string>(
    "slow",
    async (m) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000, undefined));
      return "slow";
    },
    () => true,
  );
  const startedAt = Date.now();
  const raced = await runWaterfall(meta(), [direct, slow]);
  check(
    "the first success wins without waiting for the loser",
    raced.result === "direct-result" && Date.now() - startedAt < 1_000,
    `elapsed=${Date.now() - startedAt}ms`,
  );

  // A retryable error is retried as-is, without changing the plan.
  let retryCalls = 0;
  const flaky = engine<string>("flaky", async () => {
    retryCalls += 1;
    if (retryCalls < 3) throw new EngineRetryableError("transient");
    return "recovered";
  });
  const recovered = await runWaterfall(meta(), [flaky], {
    onRetry: async () => undefined,
  });
  check("retryable error is retried", recovered.result === "recovered");
  check("three calls were made", retryCalls === 3);

  // A terminal error surfaces to the caller.
  let terminalSeen = false;
  try {
    await runWaterfall(meta(), [
      engine<string>("boom", async () => {
        throw new Error("terminal");
      }),
    ]);
  } catch (error) {
    terminalSeen = error instanceof Error && error.message === "terminal";
  }
  check("terminal error propagates", terminalSeen);

  // The attempt budget bounds a pathological page.
  let infiniteCalls = 0;
  try {
    await runWaterfall(
      meta(),
      [
        engine<string>("loop", async () => {
          infiniteCalls += 1;
          throw new EngineRetryableError("again");
        }),
      ],
      { tracker: { maxAttempts: 3 }, onRetry: async () => undefined },
    );
  } catch {
    // expected
  }
  check("attempt budget is enforced", infiniteCalls === 3, `calls=${infiniteCalls}`);

  // -------------------------------------------------------------------------
  console.log("\n[2] change judging");
  // -------------------------------------------------------------------------

  check(
    "semantic equality ignores case and whitespace",
    semanticEquals("Senior  Engineer\n", "senior engineer"),
  );
  check(
    "semantic equality ignores zero-width characters",
    semanticEquals("engineer\u200b", "engineer"),
  );
  check("semantic equality detects a real change", !semanticEquals("a", "b"));
  check(
    "deep equality ignores key order",
    deepEquals({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }),
  );
  check(
    "deep equality respects array order",
    !deepEquals([1, 2], [2, 1]),
  );

  const leaves = changesAtLeaves(
    { title: "Engineer", salary: { min: 10, max: 20 } },
    { title: "Engineer", salary: { min: 12, max: 20 } },
  );
  check("leaf diff reports one change", leaves.length === 1, `n=${leaves.length}`);
  check("leaf diff points at the changed field", leaves[0]?.path === "salary.min");

  const identical = await detectMeaningfulChange({
    previous: "Engineer role",
    current: "Engineer role",
  });
  check("identical content is not a change", identical.changed === false);
  check("identical content is not suppressed", identical.suppressed === false);

  const emptied = await detectMeaningfulChange({
    previous: "A full job description",
    current: "",
  });
  check("an emptied page is a meaningful change", emptied.changed === true);
  check(
    "an emptied page needs no judge",
    emptied.judgement.reason === "page_emptied",
  );

  // Fail open: no AI configured (or a failing call) must never silently drop
  // an alert.
  const unavailable = await judgeChangeWithLlm({
    previous: "before",
    current: "after",
  });
  check(
    "judge fails open to meaningful",
    unavailable.verdict === "meaningful",
    unavailable.verdict,
  );
  check(
    "fail-open verdict has low confidence",
    unavailable.confidence === "low",
    unavailable.confidence,
  );

  check(
    "noise is suppressed only with complete input",
    shouldSuppressAlert({
      judgement: { verdict: "noise", confidence: "high", noiseCategories: ["cookie_banner"] },
      completeness: { previousComplete: true, currentComplete: true },
    }),
  );
  check(
    "a truncated read cannot suppress an alert",
    !shouldSuppressAlert({
      judgement: { verdict: "noise", confidence: "high", noiseCategories: ["cookie_banner"] },
      completeness: { previousComplete: true, currentComplete: false },
    }),
  );
  check(
    "low confidence cannot suppress an alert",
    !shouldSuppressAlert({
      judgement: { verdict: "noise", confidence: "low", noiseCategories: ["cookie_banner"] },
      completeness: { previousComplete: true, currentComplete: true },
    }),
  );
  check(
    "a meaningful verdict is never suppressed",
    !shouldSuppressAlert({
      judgement: { verdict: "meaningful", confidence: "high", noiseCategories: [] },
      completeness: { previousComplete: true, currentComplete: true },
    }),
  );

  // -------------------------------------------------------------------------
  console.log("\n[3] outbound webhooks");
  // -------------------------------------------------------------------------

  const secret = "whsec_test";
  const body = JSON.stringify({ type: "application.created" });
  const timestamp = "1700000000000";
  const signature = signWebhookPayload(secret, timestamp, body);

  check("signature is versioned", signature.startsWith("sha256="));
  check(
    "signature is deterministic",
    signature === signWebhookPayload(secret, timestamp, body),
  );
  check(
    "a different timestamp changes the signature",
    signature !== signWebhookPayload(secret, "1700000000001", body),
  );
  check(
    "a correct signature verifies",
    verifyWebhookSignature({
      secret,
      body,
      signature,
      timestamp,
      now: Number(timestamp),
    }),
  );
  check(
    "a tampered body fails verification",
    !verifyWebhookSignature({
      secret,
      body: `${body} `,
      signature,
      timestamp,
      now: Number(timestamp),
    }),
  );
  check(
    "a wrong secret fails verification",
    !verifyWebhookSignature({
      secret: "whsec_other",
      body,
      signature,
      timestamp,
      now: Number(timestamp),
    }),
  );
  check(
    "a stale timestamp fails verification",
    !verifyWebhookSignature({
      secret,
      body,
      signature,
      timestamp,
      now: 1_700_000_000_000 + 10 * 60 * 1000,
    }),
  );
  check(
    "a malformed signature fails verification",
    !verifyWebhookSignature({ secret, body, signature: "nope", timestamp }),
  );

  const headers = buildSignatureHeaders({
    secret,
    body,
    event: "application.created",
    deliveryId: "delivery-1",
  });
  check("signature header is present", Boolean(headers["X-AngiSoft-Signature"]));
  check("timestamp header is present", Boolean(headers["X-AngiSoft-Timestamp"]));
  check("event header is present", headers["X-AngiSoft-Event"] === "application.created");
  check(
    "delivery header is present",
    headers["X-AngiSoft-Delivery"] === "delivery-1",
  );

  check("an empty subscription matches everything", eventMatches([], "anything.at.all"));
  check("an exact event matches", eventMatches(["application.created"], "application.created"));
  check(
    "a namespace matches its events",
    eventMatches(["application"], "application.status_changed"),
  );
  check(
    "a namespace does not match another namespace",
    !eventMatches(["application"], "document.processed"),
  );
  check(
    "event matching is case sensitive",
    !eventMatches(["application.created"], "Application.Created"),
  );

  const generated = generateWebhookSecret();
  check("generated secret has the right shape", /^whsec_[A-Za-z0-9_-]{20,}$/.test(generated));
  check("generated secrets differ", generated !== generateWebhookSecret());

  // -------------------------------------------------------------------------
  console.log("\n[4] credential redaction");
  // -------------------------------------------------------------------------

  const redactedUrl = redactUrl(
    "https://user:pass@example.com/path?token=abc123&page=2&q=engineer",
  );
  check("userinfo is removed", !redactedUrl.includes("pass"));
  check("secret query values are masked", !redactedUrl.includes("abc123"));
  check("the secret key is still visible", redactedUrl.includes("token="));
  check("harmless query values survive", redactedUrl.includes("page=2"));
  check(
    "a non-URL string is masked, not echoed",
    !redactUrl("raw-token-abcdefghijklmnop").includes("abcdefghijklmnop"),
    redactUrl("raw-token-abcdefghijklmnop"),
  );

  const redactedHeaders = redactHeaders({
    Authorization: "Bearer super-secret-token",
    "X-Api-Key": "key-123456789",
    "Content-Type": "application/json",
  });
  check(
    "the authorization scheme survives",
    redactedHeaders.Authorization?.startsWith("Bearer"),
    redactedHeaders.Authorization,
  );
  check(
    "the authorization credential is gone",
    !JSON.stringify(redactedHeaders).includes("super-secret-token"),
  );
  check(
    "api keys are masked",
    !JSON.stringify(redactedHeaders).includes("key-123456789"),
  );
  check(
    "harmless headers survive",
    redactedHeaders["Content-Type"] === "application/json",
  );

  check(
    "bearer tokens in text are masked",
    !redactText("failed with Bearer abcdefghijklmnop").includes("abcdefghijklmnop"),
  );
  check(
    "provider keys in text are masked",
    !redactText("key sk_live_abcdefghijklmnop").includes("abcdefghijklmnop"),
  );
  check(
    "database passwords in text are masked",
    !redactText("postgres://u:hunter2@db.example.com/app").includes("hunter2"),
  );
  check(
    "JWTs in text are masked",
    !redactText(
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
    ).includes("eyJzdWIiOiIxMjM0NTY3ODkwIn0"),
  );

  const redactedError = redactError(
    Object.assign(new Error("request failed for https://x.test/?token=secret123"), {
      code: "ECONNRESET",
      status: 502,
    }),
  );
  check("error name is kept", redactedError.name === "Error");
  check("error code is kept", redactedError.code === "ECONNRESET");
  check("error status is kept", redactedError.status === 502);
  check(
    "error message is redacted",
    !redactedError.message.includes("secret123"),
    redactedError.message,
  );

  // -------------------------------------------------------------------------
  console.log("\n[5] shared network guard");
  // -------------------------------------------------------------------------

  check("loopback is private", isPrivateAddress("127.0.0.1"));
  check("rfc1918 10/8 is private", isPrivateAddress("10.1.2.3"));
  check("rfc1918 172.16/12 is private", isPrivateAddress("172.20.1.1"));
  check("rfc1918 192.168/16 is private", isPrivateAddress("192.168.1.1"));
  check("link-local metadata is private", isPrivateAddress("169.254.169.254"));
  check("cgnat is private", isPrivateAddress("100.64.0.1"));
  check("ipv6 loopback is private", isPrivateAddress("::1"));
  check("ipv6 unique-local is private", isPrivateAddress("fd00::1"));
  check("public ipv4 is not private", !isPrivateAddress("8.8.8.8"));
  check("public ipv6 is not private", !isPrivateAddress("2606:4700::1111"));

  const blocked = async (url: string): Promise<boolean> => {
    try {
      await assertPublicUrl(url);
      return false;
    } catch {
      return true;
    }
  };

  check("file: urls are refused", await blocked("file:///etc/passwd"));
  check("localhost is refused", await blocked("http://localhost:8080/admin"));
  check("loopback ips are refused", await blocked("http://127.0.0.1/admin"));
  check("metadata ip is refused", await blocked("http://169.254.169.254/latest/meta-data"));
  check("private ips are refused", await blocked("http://10.0.0.5/admin"));
  check(
    "embedded credentials are refused",
    await blocked("https://user:pass@example.com/"),
  );
  check(
    "a public ip is allowed",
    !(await blocked("https://8.8.8.8/")),
  );

  // -------------------------------------------------------------------------
  console.log("\n[6] budgets, quotas and cache variants");
  // -------------------------------------------------------------------------

  // No limit means no accounting and no failure.
  const unlimited = await reserveBudget({
    scope: "verify",
    subject: "budget",
    estimatedUsd: 1,
    limitUsd: 0,
  });
  check("an unlimited budget always admits", unlimited.ok);
  check("an unlimited budget reserves nothing", unlimited.reservedUsd === 0);

  // Redis is unavailable in this environment, so the budget must fail open
  // rather than block the work.
  const failOpen = await reserveBudget({
    scope: "verify",
    subject: "budget",
    estimatedUsd: 5,
    limitUsd: 10,
  });
  check("the budget fails open when Redis is down", failOpen.ok);
  check("a fail-open reservation reserves nothing", failOpen.reservedUsd === 0);

  // A throwing work must propagate and release the reservation.
  let thrown = false;
  try {
    await withBudget(
      { scope: "verify", subject: "budget", estimatedUsd: 1, limitUsd: 10 },
      async () => {
        throw new Error("work failed");
      },
    );
  } catch (error) {
    thrown = error instanceof Error && error.message === "work failed";
  }
  check("a failing work propagates its error", thrown);

  // The work's own result is returned untouched.
  const settled = await withBudget(
    { scope: "verify", subject: "budget", estimatedUsd: 1, limitUsd: 10 },
    async () => ({ result: "done", actualUsd: 0.25 }),
  );
  check("a successful work returns its result", settled === "done");

  // The AI provider chain: a wrong URL shape and a wrong model name are
  // both silent, total failures of every AI-backed feature.
  const gateway = neonDialectUrl("https://branch-api.ai.region.aws.neon.tech");
  check(
    "the gateway base URL gets the /v1 dialect",
    gateway === "https://branch-api.ai.region.aws.neon.tech/v1",
    gateway,
  );
  check(
    "the gateway dialect is not appended twice",
    neonDialectUrl("https://branch-api.ai.region.aws.neon.tech/v1") === gateway,
  );
  check(
    "a trailing slash does not produce a double slash",
    neonDialectUrl("https://branch-api.ai.region.aws.neon.tech/") === gateway,
  );

  // An unpriced model must still reserve budget, or the ceiling silently
  // stops existing for every model we have not catalogued yet.
  check(
    "an unpriced model still has a price",
    priceCallWithFallback("some/unknown-model", 1_000, 1_000) > 0,
  );
  check(
    "a priced model uses its own price",
    priceCallWithFallback("gpt-4.1-mini", 1_000, 1_000) !==
      priceCallWithFallback("some/unknown-model", 1_000, 1_000),
  );
  check(
    "an unpriced model is reported as unpriced",
    priceCall("some/unknown-model", 1_000, 1_000) === null,
  );

  // The configured defaults must be models the provider actually serves.
  check(
    "the default chat model is a live model",
    !config.NVIDIA_MODEL.includes("llama-3.1-nemotron-70b"),
    config.NVIDIA_MODEL,
  );
  check(
    "the default embedding model is a live model",
    !config.NVIDIA_EMBEDDING_MODEL.includes("nv-embedqa-1b-v2"),
    config.NVIDIA_EMBEDDING_MODEL,
  );
  check(
    "the default chat model is not a reasoning model",
    !/lightning|super|nemotron-3-super/i.test(config.NVIDIA_MODEL),
    config.NVIDIA_MODEL,
  );

  // Cache variants: dimensions that change the content must not share a key.
  const mainContent = deriveVariantKey({
    urlHash: "hash-1",
    blockAds: true,
    isStealth: false,
  });
  const fullPage = deriveVariantKey({
    urlHash: "hash-1",
    blockAds: false,
    isStealth: false,
  });
  const proxiedVariant = deriveVariantKey({
    urlHash: "hash-1",
    blockAds: true,
    isStealth: true,
  });
  const otherUrl = deriveVariantKey({
    urlHash: "hash-2",
    blockAds: true,
    isStealth: false,
  });
  check("main content and full page are different variants", mainContent !== fullPage);
  check("the proxy tier is a different variant", mainContent !== proxiedVariant);
  check("a different URL is a different variant", mainContent !== otherUrl);
  check(
    "the same dimensions produce the same key",
    mainContent ===
      deriveVariantKey({ urlHash: "hash-1", blockAds: true, isStealth: false }),
  );

  // The windowed negative proof: the marker becomes usable once every
  // possible entry has aged out.
  const now = 1_000_000;
  check(
    "a marker proves emptiness once its entries have aged out",
    isNegativeStillValid(now, 60_000, now + 60_000),
  );
  check(
    "a marker does not prove emptiness while entries could still be fresh",
    !isNegativeStillValid(now, 60_000, now + 30_000),
  );

  // -------------------------------------------------------------------------
  // The pipeline's ordering and the matching agent's shape
  //
  // Two mistakes here cost the whole ingestion cycle, so they are pinned:
  //
  //   1. `matches.opportunity_id` is a foreign key to `opportunities`. The
  //      matching agent used to store a *candidate* id in it, so every
  //      insert failed and the failures were swallowed into an error
  //      string. It has to read the catalogue.
  //
  //   2. The matching agent used to resolve a candidate's coordinates once
  //      per user, per candidate — tens of thousands of round trips to the
  //      database. The city table is read once now.
  //
  // The matching agent also has to run *after* promotion, or there is
  // nothing to point at.
  // -------------------------------------------------------------------------

  const matchAgentSource = readFileSync(
    new URL(
      "../services/api/src/services/agents/match-agent.ts",
      import.meta.url,
    ),
    "utf8",
  );
  check(
    "the matching agent reads the catalogue, not the candidate queue",
    matchAgentSource.includes("FROM opportunities") &&
      !matchAgentSource.includes("FROM discovery_candidates"),
  );
  check(
    "the matching agent does not look a city up per user",
    !matchAgentSource.includes("this.geocode(") &&
      !matchAgentSource.includes("loadCityCoordinates"),
  );
  check(
    "the matching agent writes its matches in one statement",
    matchAgentSource.includes("jsonb_array_elements("),
  );
  check(
    "the matching agent scores with the product's own rule",
    matchAgentSource.includes("scoreMatch("),
  );

  const runnerSource = readFileSync(
    new URL("../services/api/src/services/agents/runner.ts", import.meta.url),
    "utf8",
  );
  check(
    "the matching agent is not part of the discovery phase",
    runnerSource.includes("POST_PROMOTION_AGENT_CLASSES") &&
      runnerSource.includes("runPostPromotionAgents"),
  );

  const ingestionSource = readFileSync(
    new URL(
      "../services/api/src/services/ingestion/run.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const promotionAt = ingestionSource.indexOf("promoteVerifiedCandidates()");
  const matchingAt = ingestionSource.indexOf("runPostPromotionAgents()");
  check(
    "promotion runs before the agents that read the catalogue",
    promotionAt > 0 && matchingAt > promotionAt,
    `promotion@${promotionAt} matching@${matchingAt}`,
  );

  // -------------------------------------------------------------------------
  // Country and place comparison
  //
  // A profile says "Kenya" and a listing says "KE". Compared literally
  // they are different countries, so a Kenyan user was shown nothing.
  // -------------------------------------------------------------------------

  check(
    "a country name and its code are the same country",
    sameCountry("Kenya", "KE"),
  );
  check(
    "a country code and its name are the same country",
    sameCountry("US", "United States"),
  );
  check(
    "two spellings of the same country match",
    sameCountry("South Africa", "south africa"),
  );
  check(
    "different countries do not match",
    !sameCountry("Kenya", "Germany"),
  );
  check(
    "an empty country does not match",
    !sameCountry(null, "Kenya") && !sameCountry("Kenya", ""),
  );
  check(
    "a remote listing is not a country match",
    !sameCountry("Remote", "Kenya"),
  );

  // The product's own rule has to use the same comparison, or the feed
  // and the recommendations disagree.
  const matchingSource = readFileSync(
    new URL("../services/api/src/services/matching.ts", import.meta.url),
    "utf8",
  );
  check(
    "the product's matching rule compares countries by meaning",
    matchingSource.includes("sameCountry("),
  );
  check(
    "the product's matching rule compares places by meaning",
    matchingSource.includes("samePlace("),
  );

  check(
    "a city with a country suffix is the same place",
    samePlace("London, London", "London"),
  );
  check(
    "a city with a qualifier is the same place",
    samePlace("UK - London", "London"),
  );
  check(
    "a city with a parenthetical is the same place",
    samePlace("London (Hybrid)", "London"),
  );
  check(
    "different cities do not match",
    !samePlace("London", "Berlin"),
  );

  console.log(
    failures === 0
      ? "\nALL CHECKS PASSED\n"
      : `\n${failures} CHECK(S) FAILED\n`,
  );
  if (failures > 0) process.exitCode = 1;
}
void main();
