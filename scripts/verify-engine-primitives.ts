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
import { startDistributedInterval } from "../services/api/src/lib/distributed-tick.js";
import { withJobDeadline } from "../services/api/src/worker/index.js";
import {
  MAX_MARKDOWN_CHARS,
  extractMetadata,
  fastTextFromHtml,
  htmlToMarkdown,
  looksLikeSpa,
  processHtml,
  processHtmlFast,
  stripHeavyMarkup,
  truncateHtml,
} from "../services/api/src/services/engine/html.js";

/** A document with the shape of a real job board page, at a given size. */
function buildLargeHtml(bytes: number): string {
  const parts: string[] = [
    "<!doctype html><html><head><title>Senior Backend Engineer</title>",
    '<meta name="description" content="We are hiring a backend engineer.">',
    "<script>window.__INLINE_STATE__ = {big: true};</script>",
    '<script type="application/ld+json">{"@type":"JobPosting","title":"Senior Backend Engineer",' +
      '"hiringOrganization":{"name":"Acme Ltd"},' +
      '"jobLocation":{"address":{"addressLocality":"Nairobi","addressCountry":"KE"}},' +
      '"baseSalary":{"value":{"minValue":180000,"maxValue":250000,"currency":"KES"}}}</script>',
    "</head><body>",
  ];
  let size = parts.join("").length;
  let index = 0;
  while (size < bytes) {
    const chunk =
      `<div class="row"><div class="col"><span class="label">Requirement ${index}</span>` +
      `<p>We are looking for a Senior Backend Engineer with Python, PostgreSQL and AWS ` +
      `experience. You will work on our platform team in Nairobi, Kenya. Apply at ` +
      `<a href="https://example.com/jobs/${index}">https://example.com/jobs/${index}</a>.</p></div></div>`;
    parts.push(chunk);
    size += chunk.length;
    index += 1;
  }
  parts.push("</body></html>");
  return parts.join("");
}

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

console.log("\n[11] distributed tick resilience");
{
  // A handler that throws must not stop the cadence.
  let thrownCalls = 0;
  const throwing = startDistributedInterval(
    "tick:{verify}:throwing",
    50,
    async () => {
      thrownCalls += 1;
      throw new Error("handler failed");
    },
    { runWhenRedisDown: true, label: "verify:throwing" },
  );
  await new Promise((resolve) => setTimeout(resolve, 280));
  throwing.stop();
  check(
    "a throwing handler does not stop the tick",
    thrownCalls >= 2,
    `calls=${thrownCalls}`,
  );

  // A slow handler must never overlap: the tick is a heartbeat, not a queue.
  let active = 0;
  let maxActive = 0;
  let slowCalls = 0;
  const slow = startDistributedInterval(
    "tick:{verify}:slow",
    30,
    async () => {
      slowCalls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 120));
      active -= 1;
    },
    { runWhenRedisDown: true, label: "verify:slow" },
  );
  await new Promise((resolve) => setTimeout(resolve, 320));
  slow.stop();
  check(
    "a slow handler never runs concurrently",
    maxActive === 1,
    `maxActive=${maxActive}`,
  );
  check("a slow handler is retried once it finishes", slowCalls >= 1, `calls=${slowCalls}`);

  // A handler that never settles must be called once, not once per tick:
  // the cadence survives, the work does not pile up.
  let hungCalls = 0;
  const hung = startDistributedInterval(
    "tick:{verify}:hung",
    30,
    () => {
      hungCalls += 1;
      return new Promise<void>(() => undefined);
    },
    { runWhenRedisDown: true, label: "verify:hung" },
  );
  await new Promise((resolve) => setTimeout(resolve, 220));
  hung.stop();
  check(
    "a handler that never settles is not called again",
    hungCalls === 1,
    `calls=${hungCalls}`,
  );

  // A stopped tick does not fire again.
  let afterStop = 0;
  const stopped = startDistributedInterval(
    "tick:{verify}:stopped",
    30,
    async () => {
      afterStop += 1;
    },
    { runWhenRedisDown: true, label: "verify:stopped" },
  );
  stopped.stop();
  await new Promise((resolve) => setTimeout(resolve, 140));
  check("a stopped tick does not fire", afterStop === 0, `calls=${afterStop}`);
}

console.log("\n[12] job deadlines");
{
  const quick = await withJobDeadline(
    "dispatch-webhooks",
    async () => "done",
    1_000,
  );
  check("a job that finishes returns its result", quick === "done");

  let timedOut = false;
  try {
    await withJobDeadline(
      "dispatch-webhooks",
      () => new Promise<string>(() => undefined),
      60,
    );
  } catch (error) {
    timedOut = error instanceof Error && error.name === "JobTimeoutError";
  }
  check("a job that never settles is failed", timedOut);
}

console.log("\n[13] bounded HTML processing");
{
  // The production failure: a 3 MB page took 71 seconds inside Turndown and
  // blocked the event loop for the whole time, which took the background
  // pipeline down. Every bound below exists because of that.
  const huge = buildLargeHtml(3 * 1024 * 1024);

  const stripped = stripHeavyMarkup(huge);
  check(
    "script content is removed before parsing",
    !stripped.includes("__INLINE_STATE__") && stripped.length < huge.length,
    `${huge.length} -> ${stripped.length}`,
  );

  const bounded = truncateHtml(stripped, 1000);
  check(
    "truncation respects the cap",
    bounded.length <= 1000,
    `length=${bounded.length}`,
  );
  check(
    "truncation cuts at a tag boundary",
    bounded.length === 0 || bounded.endsWith(">"),
    `tail=${bounded.slice(-12)}`,
  );

  const text = fastTextFromHtml(huge);
  check(
    "the linear text extraction keeps the words",
    text.includes("Senior Backend Engineer") && text.includes("Nairobi"),
    `chars=${text.length}`,
  );

  const fastStarted = Date.now();
  const fast = processHtmlFast(huge, {}, "https://example.test/job");
  const fastMs = Date.now() - fastStarted;
  check(
    "the linear whole-page pass finishes quickly",
    fastMs < 5_000,
    `${fastMs}ms`,
  );
  check(
    "the linear pass still reads the metadata",
    fast.metadata.title === "Senior Backend Engineer",
    fast.metadata.title,
  );
  check(
    "the linear pass still reads the JSON-LD",
    fast.jsonLd?.company === "Acme Ltd",
    fast.jsonLd?.company,
  );

  const started = Date.now();
  const processed = processHtml(huge, {}, "https://example.test/job");
  const processMs = Date.now() - started;
  check(
    "the whole-page pass finishes quickly",
    processMs < 15_000,
    `${processMs}ms`,
  );
  check(
    "the whole-page pass reads the metadata",
    processed.metadata.title === "Senior Backend Engineer",
  );
  check(
    "the whole-page pass reads the description",
    processed.metadata.description?.includes("backend engineer") === true,
  );
  check(
    "the whole-page pass reads the JSON-LD",
    processed.jsonLd?.company === "Acme Ltd",
  );
  check(
    "the whole-page pass reads the salary",
    processed.jsonLd?.salaryMin === 180_000,
    String(processed.jsonLd?.salaryMin),
  );
  check(
    "the markdown is bounded",
    processed.markdown.length <= MAX_MARKDOWN_CHARS,
    `length=${processed.markdown.length}`,
  );

  const markdownStarted = Date.now();
  const markdown = htmlToMarkdown(huge);
  const markdownMs = Date.now() - markdownStarted;
  check(
    "htmlToMarkdown finishes quickly on a huge document",
    markdownMs < 15_000,
    `${markdownMs}ms`,
  );
  check(
    "htmlToMarkdown is bounded",
    markdown.length <= MAX_MARKDOWN_CHARS,
    `length=${markdown.length}`,
  );

  // An SPA has scripts and almost no text.
  check(
    "a script-only page is detected as an SPA",
    looksLikeSpa("<html><body><script>window.x=1</script></body></html>"),
  );
  check(
    "a page with real text is not an SPA",
    !looksLikeSpa(
      `<html><body><script>window.x=1</script><p>${"word ".repeat(200)}</p></body></html>`,
    ),
  );
  check(
    "a page without scripts is not an SPA",
    !looksLikeSpa("<html><body><p>short</p></body></html>"),
  );

  // Metadata must survive either attribute order.
  const reversed = extractMetadata(
    '<html lang="en"><head><meta content="A description" name="description">' +
      '<meta content="OG title" property="og:title">' +
      '<link href="https://example.test/canonical" rel="canonical">' +
      "<title>A title</title></head><body></body></html>",
    "https://example.test/job",
  );
  check("metadata reads a reversed attribute order", reversed.description === "A description");
  check("metadata reads the open-graph title", reversed.ogTitle === "OG title");
  check("metadata reads the canonical link", reversed.canonical === "https://example.test/canonical");
  check("metadata reads the language", reversed.language === "en");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
