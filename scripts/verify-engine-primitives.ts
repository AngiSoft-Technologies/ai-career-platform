/**
 * Smoke verification for the discovery-engine primitives.
 *
 * Exercises the pieces that must be correct by construction: deterministic
 * rollout sampling, operator planning with position renumbering, strict
 * schema normalisation, cost limits, and the offline behaviour of the
 * Redis-backed modules (a Redis outage must degrade, not crash).
 *
 * Run: npx tsx scripts/verify-engine-primitives.ts
 */

import {
  sampled,
  deterministicPercentage,
} from "../services/api/src/lib/rollout.js";
import { planOperatorQuery, keepOperatorMatches, matchesDomainLists } from "../services/api/src/services/engine/search-operators.js";
import { toRootSchema, findStrictSchemaViolation } from "../services/api/src/services/engine/strict-schema.js";
import { CostTracking, CostLimitExceededError, estimateTokens } from "../services/api/src/services/engine/cost-tracking.js";
import { VariantCache } from "../services/api/src/services/engine/cache-variant.js";
import { reserveDailyQuota } from "../services/api/src/services/engine/quota.js";
import { jobPriority, registerBacklog, backlogDepth, clearBacklog } from "../services/api/src/services/engine/priority.js";
import { withSemaphore } from "../services/api/src/services/engine/semaphore.js";
import { executeWithRetry } from "../services/api/src/lib/retry.js";
import { hashJitterMs, deferredRunAt } from "../services/api/src/lib/jitter.js";
import { AbortManager, timeoutInstance } from "../services/api/src/lib/abort-manager.js";
import { normaliseUrlIdentity, hotKeySafe, isUuidV7 } from "../services/api/src/lib/ids.js";
import { overfetchLimitFor } from "../services/api/src/services/engine/search-orchestrator.js";

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n[1] deterministic rollout sampling");
const cohort = "tenant-123:search-overfetch";
const at5 = sampled(cohort, 5);
const at30 = sampled(cohort, 30);
check("bucket is a pure function of the key", deterministicPercentage(cohort) === deterministicPercentage(cohort));
check("ramp only adds cohorts (5% ⊆ 30%)", !at5 || at30, `at5=${at5} at30=${at30}`);
check("0% excludes everyone", !sampled(cohort, 0));
check("100% includes everyone", sampled(cohort, 100));

console.log("\n[2] operator planning + local enforcement");
const plan = planOperatorQuery("site:linkedin.com inurl:/jobs/ senior engineer");
check("inurl stripped from provider query when combined with site:", !plan.providerQuery.includes("inurl:"), plan.providerQuery);
check("plan marked relaxed", plan.relaxed);
check("site domain captured", plan.siteDomains.includes("linkedin.com"));
const items = [
  { url: "https://linkedin.com/jobs/view/1", title: "Senior Engineer" },
  { url: "https://linkedin.com/about", title: "About us" },
  { url: "https://evil.example/jobs/view/1", title: "Senior Engineer" },
];
const filtered = keepOperatorMatches(items, plan);
check("off-domain result dropped", !filtered.items.some((item) => item.url.includes("evil.example")));
check("non-job path dropped", !filtered.items.some((item) => item.url.endsWith("/about")));
check("both drops counted", filtered.dropped === 2, `dropped=${filtered.dropped}`);
check("one survivor", filtered.items.length === 1);
check("positions renumbered to 1", filtered.items[0]?.position === 1);
check("untouched plans are not renumbered", keepOperatorMatches(items, planOperatorQuery("plain query")).items[0]?.position === undefined);

console.log("\n[3] domain list enforcement");
check("include list honoured", matchesDomainLists("https://brightermonday.co.ke/jobs", ["brightermonday.co.ke"]));
check("subdomain of include honoured", matchesDomainLists("https://www.brightermonday.co.ke/jobs", ["brightermonday.co.ke"]));
check("exclude list honoured", !matchesDomainLists("https://facebook.com/jobs", [], ["facebook.com"]));
check("other-TLD base domain excluded", !matchesDomainLists("https://facebook.co.uk/jobs", [], ["facebook.com"]));

console.log("\n[4] strict schema normalisation");
const bare = { title: { type: "string" }, salary: { type: "number" } };
const root = toRootSchema(bare);
check("bare property map wrapped", root.type === "object");
check("all keys required", Array.isArray(root.required) && root.required.length === 2);
check("objects closed", root.additionalProperties === false);
const union = { type: ["object", "null"], properties: { a: { type: "string" } } };
const unionRoot = toRootSchema(union);
check("union root collapsed", unionRoot.type === "object");
check("nullable flag preserved", unionRoot.nullable === true);
check("oneOf mapped to anyOf", (toRootSchema({ anyOf: undefined, oneOf: [{ type: "string" }] }) as { anyOf?: unknown }).anyOf !== undefined);
check("unsupported keyword reported", findStrictSchemaViolation({ type: "object", properties: {}, allOf: [] })?.includes("allOf") ?? false);
check("violation path is anchored", (findStrictSchemaViolation({ type: "object", properties: { a: { properties: {} } } }) ?? "").includes("$."));

console.log("\n[5] cost tracking fails fast");
const tracker = new CostTracking(0.005);
tracker.addCall({ type: "screen", model: "gpt-4.1-mini", promptTokens: 10_000, completionTokens: 100 });
let threw = false;
try {
  tracker.addCall({ type: "screen", model: "gpt-4.1-mini", promptTokens: 10_000, completionTokens: 100 });
} catch (error) {
  threw = error instanceof CostLimitExceededError;
}
check("limit overrun throws immediately", threw);
check("call-site provenance captured", tracker.toJSON().detail.every((call) => typeof call.stack === "string"));
check("token estimation sane", estimateTokens("abcd") === 1);

async function main(): Promise<void> {
console.log("\n[6] Redis-backed modules degrade without Redis");
const cache = new VariantCache<string>("verify", { entryTtlSeconds: 60, negativeTtlMs: 60_000 });
const read = await cache.read({ urlHash: "abc" });
check("cache read returns error status, never throws", read.status === "error");
const quota = await reserveDailyQuota("verify", "smoke");
check("quota fails open when Redis is down", quota.ok === true);
check("semaphore proceeds uncapped when Redis is down", (await withSemaphore("verify", 4, "holder", async () => 42)) === 42);

console.log("\n[7] retry with a validity predicate");
let attempts = 0;
const result = await executeWithRetry(
  async () => {
    attempts += 1;
    return attempts < 3 ? null : "valid";
  },
  (value): value is string => value === "valid",
);
check("retries until the guard accepts", result === "valid" && attempts === 3, `attempts=${attempts}`);

console.log("\n[8] deterministic jitter + identity keys");
check("jitter stable per entity", hashJitterMs("monitor-1", 60_000) === hashJitterMs("monitor-1", 60_000));
check("jitter spread across entities", hashJitterMs("monitor-1", 60_000) !== hashJitterMs("monitor-2", 60_000));
const deferred = deferredRunAt(new Date(0), 600_000, "monitor-1");
check("deferred run is within half the interval", deferred.getTime() >= 0 && deferred.getTime() <= 300_000);
check("url identity normalises", normaliseUrlIdentity("HTTPS://WWW.Example.com/jobs/") === "https://example.com/jobs");
check("v7 detection", isUuidV7("018f8f2c-0000-7000-8000-000000000001"));
check("non-v7 rejected", !isUuidV7("018f8f2c-0000-4000-8000-000000000001"));
check("hot-key-safe prefix added", hotKeySafe("abc").length > "abc".length && hotKeySafe("abc").endsWith("abc"));

console.log("\n[9] overfetch strategy");
const relaxedPlan = planOperatorQuery("site:linkedin.com inurl:/jobs/ engineer");
check("relaxed plan over-fetches 5x", overfetchLimitFor(10, relaxedPlan) === 50);
check("normal plan over-fetches 2x", overfetchLimitFor(10, planOperatorQuery("engineer")) === 20);
check("overfetch capped at 100", overfetchLimitFor(80, planOperatorQuery("engineer")) === 100);

console.log("\n[10] abort tiers");
const manager = new AbortManager([timeoutInstance(50, "engine")]);
check("external deadline queryable", manager.msUntilNearestTimeout("engine") !== null);
manager.throwIfAborted();
check("no throw before timeout", true);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
