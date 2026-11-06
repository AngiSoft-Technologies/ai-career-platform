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
import { jobDiscoveryGate } from "../services/api/src/services/engine/search-orchestrator.js";
import {
  findJobLinks,
  detectAts,
  oracleFinder,
  buildBoardQueries,
} from "../services/api/src/services/engine/discover.js";
import { boardKey } from "../services/api/src/services/engine/ats.js";
import {
  isUnreadableHost,
  jobUrlRefusal,
  looksLikeJobUrl,
} from "../services/api/src/services/engine/job-url.js";
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
import {
  isBingRedirectWrapper,
  isNewsRedirectWrapper,
  isUnreadableRedirectWrapper,
  unwrapSearchRedirect,
} from "../services/api/src/services/engine/redirect.js";
import { isBlockedHost } from "../services/api/src/lib/net-guard.js";
import { directFetch } from "../services/api/src/services/engine/egress.js";
import {
  canonicalCompanyKey,
  companySlug,
  isPlausibleEmployer,
  normaliseCompanyName,
  rawCompanyKey,
  sameCompany,
} from "../services/api/src/services/engine/company.js";
import { extractJobDeterministic } from "../services/api/src/services/engine/extract.js";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

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

console.log("\n[3b] finding the postings inside a page of postings");
const boardHtml = `
  <a href="/jobs/companies/sinnkontor/data-scientist-tegtmeier-internet-sol">Junior Data Scientist</a>
  <a href="/job/data-analyst-cloudfactory-2">Data Analyst</a>
  <a href="/job/bi-analyst-at-4g-capital">BI Analyst</a>
  <a href="/jobs/data-scientist">Data Scientist</a>
  <a href="/jobs/data-scientist?page=2">Next</a>
  <a href="/jobs/data-scientist#content">Data Scientist</a>
  <a href="/about/company">About us</a>
`;
const boardLinks = findJobLinks(
  boardHtml,
  "https://board.example/jobs/data-scientist",
  10,
);
check(
  "a posting at a deep path is found",
  boardLinks.includes(
    "https://board.example/jobs/companies/sinnkontor/data-scientist-tegtmeier-internet-sol",
  ),
  boardLinks.join(" "),
);
check(
  "a posting with a number is found",
  boardLinks.includes("https://board.example/job/data-analyst-cloudfactory-2"),
  boardLinks.join(" "),
);
check(
  "a posting with only a slug is found",
  boardLinks.includes("https://board.example/job/bi-analyst-at-4g-capital"),
  boardLinks.join(" "),
);
check(
  "a pagination link is not a page of its own",
  !boardLinks.some((link) => link.includes("page=2")),
  boardLinks.join(" "),
);
check(
  "a fragment does not make a second page",
  !boardLinks.some((link) => link.includes("#content")),
  boardLinks.join(" "),
);
check(
  "a page that is not about jobs is left alone",
  !boardLinks.some((link) => link.includes("/about/")),
  boardLinks.join(" "),
);
check(
  "the postings come before the page of postings",
  boardLinks.indexOf("https://board.example/job/data-analyst-cloudfactory-2") <
    boardLinks.indexOf("https://board.example/jobs/data-scientist"),
  boardLinks.join(" "),
);

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

console.log("\n[14] search-engine redirect wrappers");
{
  // Bing wraps every result in a click-through URL. The wrapper is a
  // redirect *page*, not a redirect, so crawling it returns a notice
  // instead of the listing — 3 307 queued rows were lost that way.
  const bing =
    "https://www.bing.com/ck/a?!&&p=79d7JmltdHM9MTc5MzU3NzYwMA&ptn=3&ver=2" +
    "&u=a1aHR0cHM6Ly93d3cuYmFtYm9vaHIuY29tL2NhcmVlcnMvcHJvZHVjdC10ZWFt&ntb=1";

  check("a Bing wrapper is recognised", isBingRedirectWrapper(bing));
  check(
    "a Bing wrapper is decoded to its destination",
    unwrapSearchRedirect(bing) ===
      "https://www.bamboohr.com/careers/product-team",
    unwrapSearchRedirect(bing),
  );
  check(
    "an unwrapped destination is not a wrapper",
    !isUnreadableRedirectWrapper(unwrapSearchRedirect(bing)),
  );
  check(
    "a wrapper that cannot be read is still recognised",
    isUnreadableRedirectWrapper(
      "https://www.bing.com/ck/a?u=a1not-base64-at-all!!&ntb=1",
    ),
  );
  check(
    "a wrapper without a payload is still recognised",
    isUnreadableRedirectWrapper("https://www.bing.com/ck/a?ptn=3"),
  );

  // Google News hides a news article behind a wrapper that cannot be
  // decoded. The article is about a job; it is not the job.
  check(
    "a Google News wrapper is recognised",
    isNewsRedirectWrapper(
      "https://news.google.com/rss/articles/CBMitwFBVV95cUxPQUFXWFBOZ3VM?oc=5",
    ),
  );
  check(
    "a Google News wrapper is never worth crawling",
    isUnreadableRedirectWrapper(
      "https://news.google.com/rss/articles/CBMitwFBVV95cUxPQUFXWFBOZ3VM?oc=5",
    ),
  );
  check(
    "an ordinary URL is not a news wrapper",
    !isNewsRedirectWrapper("https://example.test/jobs/1"),
  );

  // DuckDuckGo wraps the destination in a query parameter.
  const ddg =
    "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.test%2Fjobs%2F1&rut=abc";
  check(
    "a DuckDuckGo wrapper is decoded",
    unwrapSearchRedirect(ddg) === "https://example.test/jobs/1",
    unwrapSearchRedirect(ddg),
  );

  // A plain URL is left alone.
  check(
    "a plain URL is untouched",
    unwrapSearchRedirect("https://example.test/jobs/1") ===
      "https://example.test/jobs/1",
  );
  check(
    "a plain URL is not a wrapper",
    !isUnreadableRedirectWrapper("https://example.test/jobs/1"),
  );
}

console.log("\n[15] content policy and checked redirects");
{
  // -------------------------------------------------------------------------
  // The content policy
  //
  // A search-engine result can be anything. Some of what comes back has
  // no place in a job platform, and the browse agent was crawling it.
  // -------------------------------------------------------------------------
  check("a blocked host is blocked", isBlockedHost("pornhub.com"));
  check(
    "a subdomain of a blocked host is blocked",
    isBlockedHost("www.pornhub.com"),
  );
  check(
    "a host that merely mentions a blocked host is not blocked",
    !isBlockedHost("pornhub.com.example.test"),
  );
  check("a job board is not blocked", !isBlockedHost("linkedin.com"));
  check("a job board subdomain is not blocked", !isBlockedHost("www.linkedin.com"));

  // The migration that clears the queued URLs has to know the same
  // hosts the application refuses, or the queue keeps handing back
  // pages the crawler will not read.
  const guardSource = readFileSync(
    new URL(
      "../services/api/src/lib/net-guard.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const blockBlock = /const BLOCKED_HOSTS = new Set\(\[([\s\S]*?)\]\);/.exec(
    guardSource,
  );
  const blockedHosts = [
    ...(blockBlock?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ].map((match) => match[1] ?? "");
  check("the block list is not empty", blockedHosts.length > 10);

  // The migrations are not versioned — they are gatekept by the owner —
  // so a fresh clone may not have them. The check runs when the file is
  // there, and is skipped when it is not.
  let migrationSource: string | null = null;
  try {
    migrationSource = readFileSync(
      new URL(
        "../db/migrations/032_blocked_host_queue.sql",
        import.meta.url,
      ),
      "utf8",
    );
  } catch {
    migrationSource = null;
  }

  if (migrationSource === null) {
    console.log(
      "  skip the queue migration is not in this clone (migrations are not versioned)",
    );
  } else {
    const missingHosts = blockedHosts.filter(
      (host) => !migrationSource.includes(`'${host}'`),
    );
    check(
      "the queue migration knows every blocked host the guard knows",
      missingHosts.length === 0,
      missingHosts.slice(0, 10).join(", "),
    );
  }

  // -------------------------------------------------------------------------
  // Redirects are checked, hop by hop
  //
  // `fetch` follows redirects on its own and does not check them: a public
  // URL can answer with a redirect to a private address — the cloud
  // metadata endpoint — or to a blocked host, and the request that follows
  // goes there unchecked.
  // -------------------------------------------------------------------------
  const server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("hello");
      return;
    }
    if (request.url === "/to-private") {
      response.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      response.end();
      return;
    }
    if (request.url === "/to-blocked") {
      response.writeHead(302, { location: "https://www.pornhub.com/" });
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const plain = await directFetch(`${base}/ok`, {});
  check("a plain fetch still works", plain.status === 200);
  check(
    "a plain fetch reports the URL it read",
    plain.finalUrl === `${base}/ok`,
    plain.finalUrl,
  );

  let privateRefusal = "";
  try {
    await directFetch(`${base}/to-private`, {});
  } catch (error) {
    privateRefusal = error instanceof Error ? error.message : String(error);
  }
  check(
    "a redirect to a private address is refused",
    privateRefusal.includes("PRIVATE_ADDRESS"),
    privateRefusal,
  );

  let blockedRefusal = "";
  try {
    await directFetch(`${base}/to-blocked`, {});
  } catch (error) {
    blockedRefusal = error instanceof Error ? error.message : String(error);
  }
  check(
    "a redirect to a blocked host is refused",
    blockedRefusal.includes("BLOCKED_HOST"),
    blockedRefusal,
  );

  server.close();
}

console.log("\n[16] the identity of an employer");
{
  // -------------------------------------------------------------------------
  // One employer, one row.
  //
  // The employer's name arrives from a dozen places — the board's URL
  // token, the board page's title, the posting's JSON-LD, the page's
  // og:site_name, a model's guess — and no two of them agree. These
  // checks are the difference between one employer under several rows
  // and one row per employer.
  // -------------------------------------------------------------------------

  // The same employer, written two ways.
  check(
    "a name written as one word and as two is one employer",
    sameCompany("AnywhereNow", "Anywhere Now"),
  );
  check(
    "the canonical key ignores spacing",
    canonicalCompanyKey("AnywhereNow") === canonicalCompanyKey("Anywhere Now"),
  );
  check(
    "the canonical key ignores the legal form",
    canonicalCompanyKey("Acme Ltd") === canonicalCompanyKey("ACME LIMITED"),
  );
  check(
    "the canonical key ignores case and punctuation",
    canonicalCompanyKey("Acme, Inc.") === canonicalCompanyKey("acme inc"),
  );
  check(
    "two different employers are two different employers",
    !sameCompany("Acme", "Globex"),
  );
  check(
    "a missing name does not match a name",
    !sameCompany(null, "Acme") && !sameCompany("", "Acme"),
  );

  // The identity is the canonical key; the slug is the readable form
  // the employer's page is known by.
  check(
    "the identity ignores the spacing",
    canonicalCompanyKey("Anywhere Now") === canonicalCompanyKey("AnywhereNow"),
  );
  check(
    "the slug is the readable form",
    companySlug("Anywhere Now") === "anywhere-now",
    companySlug("Anywhere Now"),
  );
  check(
    "the slug fits the column",
    companySlug("A".repeat(200)).length <= 80,
  );
  check(
    "a name that is not an employer still has a slug",
    companySlug("Legal Counsel - 12 month FTC at Rightmove Greenhouse") !== "",
  );

  // The board's name, appended to the employer's own.
  check(
    "the board's name is stripped from the end",
    normaliseCompanyName("Indie Campers | LinkedIn") === "Indie Campers",
    String(normaliseCompanyName("Indie Campers | LinkedIn")),
  );
  check(
    "the board's name is stripped with a hyphen too",
    normaliseCompanyName("SingleStore-LinkedIn") === "SingleStore",
    String(normaliseCompanyName("SingleStore-LinkedIn")),
  );
  check(
    "the page's word for the board is stripped",
    normaliseCompanyName("Acme Careers") === "Acme",
    String(normaliseCompanyName("Acme Careers")),
  );

  // A job title is not an employer.
  check(
    "a title with the employer appended is not an employer",
    !isPlausibleEmployer("Legal Counsel - 12 month FTC at Rightmove Greenhouse"),
  );
  check(
    "a title on its own is not an employer",
    !isPlausibleEmployer("Software Engineer"),
  );
  check(
    "a page heading is not an employer",
    !isPlausibleEmployer("How We Work & What We Value"),
  );
  check(
    "the board's name alone is not an employer",
    !isPlausibleEmployer("Ashby"),
  );
  check(
    "a real employer whose name contains a role word in the middle is kept",
    isPlausibleEmployer("Customs Support Group"),
  );
  check(
    "a firm that names itself in the plural is kept",
    isPlausibleEmployer("True North Partners"),
  );
  check(
    "a real employer is kept",
    isPlausibleEmployer("BambooHR"),
  );
  check(
    "an employer named after its domain is kept",
    normaliseCompanyName("Happyrobot.ai") === "Happyrobot.ai",
    String(normaliseCompanyName("Happyrobot.ai")),
  );
  check(
    "the system's own label for a site is not the employer's name",
    normaliseCompanyName("Safaricom Candidate Experience site") ===
      "Safaricom",
    String(normaliseCompanyName("Safaricom Candidate Experience site")),
  );
  check(
    "the board's own label for itself is not the employer's name",
    normaliseCompanyName("SCI Career Site") === "SCI",
    String(normaliseCompanyName("SCI Career Site")),
  );

  // A name that is not an employer still has an identity of its own, or
  // every such posting in the catalogue would share one.
  check(
    "a name that is not an employer has no canonical key",
    canonicalCompanyKey("Writer") === "",
    canonicalCompanyKey("Writer"),
  );
  check(
    "a name that is not an employer still has a raw key",
    rawCompanyKey("Writer") === "writer",
    rawCompanyKey("Writer"),
  );
  check(
    "two such names do not share a key",
    rawCompanyKey("Writer") !== rawCompanyKey("Ashby"),
  );
  check(
    "an empty name has no key at all",
    rawCompanyKey("") === "" && rawCompanyKey(null) === "",
  );
  check(
    "the raw key ignores the spacing",
    rawCompanyKey("Legal Counsel - 12 month FTC") ===
      rawCompanyKey("legalcounsel12monthftc"),
  );

  // -------------------------------------------------------------------------
  // The page is the authority
  //
  // The model fills the gaps the page left; it does not overwrite what
  // the page said. It used to overwrite, and one board's twenty-nine
  // re-reads were each recorded as "the employer changed".
  // -------------------------------------------------------------------------
  const posting = extractJobDeterministic({
    url: "https://jobs.lever.co/weloglobal/abc",
    markdown:
      "# Arabic Linguistic Evaluator\n\nWe are hiring a language evaluator in Nairobi, Kenya.",
    metadata: { title: "Welo Global" },
    jsonLd: {
      title: "Arabic Linguistic Evaluator & Functional Tester",
      description:
        "We are hiring a language evaluator in Nairobi, Kenya. Apply through the board.",
      company: "Welo Global",
      location: "Nairobi, Kenya",
      city: "Nairobi",
      country: "Kenya",
      applyUrl: "https://jobs.lever.co/weloglobal/abc",
    },
  });
  check(
    "the employer's name comes from the posting",
    posting.company === "Welo Global",
    String(posting.company),
  );
  check(
    "the entities in a JSON-LD title are decoded",
    posting.title === "Arabic Linguistic Evaluator & Functional Tester",
    posting.title,
  );
}

console.log("\n[17] the address of a board");
{
  // -------------------------------------------------------------------------
  // A board's address is not always a board's address.
  //
  // Some employers publish at ".../job/<location>/<title>_<id>", with
  // the site's own name left out of the address. That address was read
  // as a board called "job", and the board could only ever answer 404:
  // the endpoint that serves the postings is addressed by the site's
  // name, which is nowhere in the address.
  //
  // So the address of a posting names the tenant and not the site, and
  // the site is asked for — the tenant's own robots.txt names every
  // site it publishes under.
  // -------------------------------------------------------------------------

  const boardAddress = detectAts(
    "https://acme.wd1.myworkdayjobs.com/en-US/External",
  );
  check(
    "a board's address names the site",
    boardAddress?.kind === "workday" &&
      boardAddress.token === "acme|wd1|External",
    boardAddress ? `${boardAddress.kind}:${boardAddress.token}` : "none",
  );

  const postingAddress = detectAts(
    "https://acme.wd1.myworkdayjobs.com/job/Nairobi-Office/Engineer_JR123",
  );
  check(
    "a posting's address names the tenant and not a site",
    postingAddress?.kind === "workday" &&
      postingAddress.token === "acme|wd1|",
    postingAddress ? `${postingAddress.kind}:${postingAddress.token}` : "none",
  );

  const siteAddress = detectAts(
    "https://acme.wd1.myworkdayjobs.com/Acme_Careers",
  );
  check(
    "a board published without a locale names the site",
    siteAddress?.kind === "workday" &&
      siteAddress.token === "acme|wd1|Acme_Careers",
    siteAddress ? `${siteAddress.kind}:${siteAddress.token}` : "none",
  );

  const otherBoard = detectAts("https://jobs.lever.co/weloglobal");
  check(
    "the other boards are untouched",
    otherBoard?.kind === "lever" && otherBoard.token === "weloglobal",
    otherBoard ? `${otherBoard.kind}:${otherBoard.token}` : "none",
  );

  // Oracle's career sites are addressed by tenant and site, and the
  // employer's name is on the board's page rather than in the address.
  const oracleBoard = detectAts(
    "https://eoin.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_3001/jobs",
  );
  check(
    "an Oracle board's address names the tenant and the site",
    oracleBoard?.kind === "oracle" &&
      oracleBoard.token === "eoin.fa.em3.oraclecloud.com|CX_3001",
    oracleBoard ? `${oracleBoard.kind}:${oracleBoard.token}` : "none",
  );

  // The finder's separators are semicolons. With commas, Oracle reads
  // the first part and ignores the rest — and whether the postings come
  // back at all depends on the tenant: one employer's board answered
  // with seven roles, the next answered with none, and the board was
  // not empty.
  const finder = oracleFinder("CX_3001");
  check(
    "the Oracle finder is separated by semicolons",
    finder.includes("siteNumber=CX_3001;facetsList=") && !finder.includes(","),
    finder.slice(0, 80),
  );
  check(
    "the Oracle finder asks for the site",
    finder.startsWith("findReqs;siteNumber=CX_3001"),
    finder.slice(0, 40),
  );
}

console.log("\n[18] the address of a posting");
{
  // -------------------------------------------------------------------------
  // The queue is filled by search engines and by careers pages, and both
  // put things in it that are not postings. Every one of them is a
  // request spent to be refused.
  //
  // The rules are narrow on purpose: a URL is refused only when it is
  // *known* not to be a posting. A posting whose address is a bare slug
  // is still a posting, and refusing it would throw away most of the
  // roles the catalogue holds.
  // -------------------------------------------------------------------------

  check(
    "a posting's address is queued",
    looksLikeJobUrl("https://remowork.life/jobs/tier-1-support-agent"),
  );
  check(
    "a posting's address with an id is queued",
    looksLikeJobUrl(
      "https://kaziconnect-ke.work/jobs/clinical-officer-oncology-oasis-healthcare-1",
    ),
  );
  check(
    "an address with no path is not a posting",
    !looksLikeJobUrl("https://remowork.life/"),
  );
  check(
    "a help page is not a posting",
    !looksLikeJobUrl("https://www.amazon.com/gp/help/customer/display.html"),
  );
  check(
    "a policy page is not a posting",
    !looksLikeJobUrl("https://example.com/privacy-policy"),
  );
  check(
    "a sign-in page is not a posting",
    !looksLikeJobUrl("https://example.com/login"),
  );
  check(
    "an examination board's news page is not a posting",
    !looksLikeJobUrl(
      "https://toppersexam.com/news-and-careers/daily-current-affairs_22.html",
    ),
  );
  check(
    "a host we are not allowed to read is not a posting",
    !looksLikeJobUrl("https://ke.linkedin.com/jobs/data-analyst-jobs"),
  );
  check(
    "the refusal says why",
    jobUrlRefusal("https://ke.linkedin.com/jobs/data-analyst-jobs") ===
      "HOST_NOT_READABLE",
    String(jobUrlRefusal("https://ke.linkedin.com/jobs/data-analyst-jobs")),
  );
  check(
    "a posting is not refused",
    jobUrlRefusal("https://remowork.life/jobs/tier-1-support-agent") === null,
  );
  check(
    "an address that is not an address is refused",
    !looksLikeJobUrl("not a url"),
  );
}

console.log("\n[19] finding the boards");
{
  // -------------------------------------------------------------------------
  // An employer's vacancies often exist in one place only, and that place
  // is addressed rather than named: "eoin.fa.em3.oraclecloud.com|CX_3001"
  // says nothing about KCB Group, and the board's own page is the only
  // place the employer's name is written.
  //
  // So the board has to be found by its address, and the search layer
  // has to keep it: the title of a board names no role, and the address
  // says nothing about the query, so both the title gate and the query
  // check refuse a board that is worth more than a hundred postings.
  // -------------------------------------------------------------------------

  const boardGate = jobDiscoveryGate("software engineer jobs Kenya");

  const oracleResult = {
    url: "https://esal.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/jobs",
    title: "Search Jobs - Central Bank of Kenya Careers",
    description: "",
    engine: "duckduckgo",
  };
  check(
    "a board's title names no role, and the board is kept",
    boardGate(oracleResult),
    "refused",
  );

  const unrelated = {
    url: "https://www.forexfactory.com/calendar",
    title: "Calendar | Forex Factory",
    description: "",
    engine: "bing",
  };
  check(
    "a page that is not about a role is still refused",
    !boardGate(unrelated),
    "kept",
  );

  // The queries that look for boards.
  const boardQueries = buildBoardQueries({
    roles: [],
    skills: [],
    countries: ["Kenya"],
    knownDomains: [],
  });
  check(
    "the board queries ask for the address of an Oracle board",
    boardQueries.some((query) => query.includes("hcmUI/CandidateExperience")),
    boardQueries[0],
  );
  check(
    "the board queries that name a place name it",
    boardQueries
      .filter((query) => !query.includes(" OR "))
      .every((query) => query.includes("Kenya")),
    boardQueries.join(" | "),
  );
  check(
    "the board queries ask for the address of a Workday board",
    boardQueries.some((query) => query.includes("myworkdayjobs")),
    boardQueries.join(" | "),
  );

  // A board is remembered under its kind and its token together.
  check(
    "a board is remembered under its address",
    boardKey({ kind: "oracle", token: "esal.fa.ocs.oraclecloud.com|CX_2" }) ===
      "oracle:esal.fa.ocs.oraclecloud.com|CX_2",
    boardKey({ kind: "oracle", token: "esal.fa.ocs.oraclecloud.com|CX_2" }),
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

void main();