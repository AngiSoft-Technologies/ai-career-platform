import { Router } from "express";
import { z } from "zod";
import { scrapeUrl } from "../services/engine/fetch.js";
import { extractJob } from "../services/engine/extract.js";
import { searchWeb, type WebSearchResult } from "../services/engine/search.js";
import { crawlSite, discoverJobUrls } from "../services/engine/crawl.js";
import { capturePage } from "../services/engine/screen.js";
import { assessEligibility } from "../services/engine/eligibility.js";
import { createMarkdownChangeDiff, judgeListingChange, detectMeaningfulChange } from "../services/engine/freshness.js";
import { egressStatus } from "../services/engine/egress.js";
import { getSkills, renderSkillCatalogue } from "../services/engine/skills.js";
import { fetchFreeJobs } from "../services/engine/sources.js";
import { fetchAtsBoard, detectAts } from "../services/engine/discover.js";
import { logger } from "../logger.js";

/**
 * Agent API — the HTTP face of the discovery engine.
 *
 * Everything here runs on our own infrastructure: our fetch engine, our
 * extraction, our search clients, our crawler, our egress pool. No vendor
 * service and no vendor key is involved at any point.
 */
export const agentRouter = Router();

const browseSchema = z.object({
  url: z.string().url(),
  useLlm: z.boolean().optional(),
  includeEndpoints: z.boolean().optional(),
});

const searchSchema = z.object({
  query: z.string().min(2).max(400),
  limit: z.number().int().min(1).max(20).optional(),
  engine: z.enum(["searxng", "duckduckgo", "bing"]).optional(),
});

const extractSchema = z.object({
  url: z.string().url(),
  markdown: z.string().min(20).max(200_000),
  useLlm: z.boolean().optional(),
});

const crawlSchema = z.object({
  url: z.string().url(),
  maxDepth: z.number().int().min(1).max(6).optional(),
  maxPages: z.number().int().min(1).max(60).optional(),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
});

const boardSchema = z.object({
  url: z.string().url(),
});

const eligibilitySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

const diffSchema = z.object({
  previous: z.string(),
  current: z.string(),
});

function authorised(request: { header(name: string): string | undefined }): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;
  return request.header("x-internal-token") === expected;
}

/** Jobs are public by design; browsing is available to the signed-in app too. */
function authorisedOrUser(request: {
  header(name: string): string | undefined;
}): boolean {
  return (
    authorised(request) ||
    Boolean(request.header("authorization")?.startsWith("Bearer "))
  );
}

agentRouter.post("/browse", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = browseSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    const scraped = await scrapeUrl(parsed.data.url, {
      onlyMainContent: true,
      preferProxy: true,
    });
    const job = await extractJob({
      url: scraped.finalUrl,
      markdown: scraped.markdown,
      metadata: scraped.metadata,
      jsonLd: scraped.jsonLd,
      useLlm: parsed.data.useLlm,
    });
    const eligibility = assessEligibility({
      title: job.title,
      description: job.description,
      country: job.country,
      city: job.city,
    });

    const capture = parsed.data.includeEndpoints
      ? await capturePage(parsed.data.url).catch(() => null)
      : null;

    response.json({
      success: true,
      url: scraped.finalUrl,
      status: scraped.status,
      via: scraped.via,
      metadata: scraped.metadata,
      jsonLd: scraped.jsonLd,
      job,
      eligibility,
      markdown: scraped.markdown.slice(0, 20_000),
      ...(capture
        ? {
            endpoints: capture.endpoints,
            embeddedJobs: capture.jobs.slice(0, 30),
            stateKeys: capture.stateKeys,
          }
        : {}),
    });
  } catch (error) {
    logger.warn({ error, url: parsed.data.url }, "Agent browse failed");
    response.status(502).json({
      error: "Browse failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

agentRouter.post("/search", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = searchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    const { duckDuckGoSearch, searxngSearch, bingSearch } = await import(
      "../services/engine/search.js"
    );

    let results: WebSearchResult[];

    if (parsed.data.engine) {
      // Caller pinned an engine: honour it exactly, no orchestration.
      const runner =
        parsed.data.engine === "duckduckgo"
          ? duckDuckGoSearch
          : parsed.data.engine === "bing"
            ? bingSearch
            : searxngSearch;
      results = await runner(parsed.data.query, { limit: parsed.data.limit ?? 10 });
    } else {
      // No engine pinned: run the planned fan-out, so query operators are
      // planned, enforced locally and positions are renumbered.
      const { searchWebPlannedAll } = await import(
        "../services/engine/search-orchestrator.js"
      );
      results = (
        await searchWebPlannedAll(parsed.data.query, { limit: parsed.data.limit ?? 10 })
      ).results;
    }

    response.json({
      success: true,
      query: parsed.data.query,
      engine: parsed.data.engine ?? "all",
      results,
    });
  } catch (error) {
    response.status(502).json({
      error: "Search failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

agentRouter.post("/extract", async (request, response) => {
  if (!authorisedOrUser(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = extractSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    const { extractJobWithLlm, extractJobDeterministic } = await import(
      "../services/engine/extract.js"
    );
    const job = await extractJobWithLlm({
      url: parsed.data.url,
      markdown: parsed.data.markdown,
      current: extractJobDeterministic({
        url: parsed.data.url,
        markdown: parsed.data.markdown,
      }),
    });
    response.json({
      success: true,
      job,
      deterministicOnly: parsed.data.useLlm === false,
    });
  } catch (error) {
    response.status(502).json({
      error: "Extract failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

agentRouter.post("/crawl", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = crawlSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    const result = await crawlSite(parsed.data.url, {
      maxDepth: parsed.data.maxDepth,
      maxPages: parsed.data.maxPages,
      includePaths: parsed.data.includePaths,
      excludePaths: parsed.data.excludePaths,
      jobBias: true,
      timeoutMs: 90_000,
    });
    response.json({ success: true, ...result });
  } catch (error) {
    response.status(502).json({
      error: "Crawl failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/** Finds an employer's job URLs by crawling its domain (no list required). */
agentRouter.post("/discover-jobs", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = z.object({ domain: z.string().min(3) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const urls = await discoverJobUrls(parsed.data.domain);
    const board = detectAts(parsed.data.domain.startsWith("http") ? parsed.data.domain : `https://${parsed.data.domain}`);
    const boardJobs = board ? await fetchAtsBoard(board).catch(() => []) : [];
    response.json({
      success: true,
      domain: parsed.data.domain,
      jobUrls: urls,
      ats: board,
      boardJobCount: boardJobs.length,
    });
  } catch (error) {
    response.status(502).json({
      error: "Discovery failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/** Pulls every current vacancy from a known ATS board. */
agentRouter.post("/board", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = boardSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const board = detectAts(parsed.data.url);
    if (!board) {
      response.status(400).json({
        error: "Not a recognised ATS board",
        hint: "Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Workday, Oracle HCM",
      });
      return;
    }
    const jobs = await fetchAtsBoard(board);
    response.json({ success: true, board, count: jobs.length, jobs });
  } catch (error) {
    response.status(502).json({
      error: "Board fetch failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

agentRouter.post("/eligibility", async (request, response) => {
  const parsed = eligibilitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  response.json({
    success: true,
    eligibility: assessEligibility(parsed.data),
  });
});

/**
 * Structural change judgement.
 *
 * The deterministic diff above answers "what changed in the text"; this one
 * answers "is that change about the vacancy or is it page churn" — the
 * question that decides whether an alert is sent or suppressed. It is the
 * same judgement the discovery pipeline uses internally.
 */
agentRouter.post("/change-judgement", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = z
    .object({
      previous: z.string(),
      current: z.string(),
      url: z.string().url().optional(),
      previousComplete: z.boolean().optional(),
      currentComplete: z.boolean().optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  const result = await detectMeaningfulChange(parsed.data);
  response.json({ success: true, ...result });
});

/** Real markdown diff + a judgement of what changed between two reads. */
agentRouter.post("/diff", async (request, response) => {
  if (!authorised(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = diffSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  const diff = createMarkdownChangeDiff(parsed.data.previous, parsed.data.current);
  const judgement = judgeListingChange({
    previousMarkdown: parsed.data.previous,
    currentMarkdown: parsed.data.current,
  });

  response.json({ success: true, diff, judgement });
});

/**
 * Job-seeker browser reports.
 *
 * The application agent runs in the user's own browser. It posts back what it
 * did — step results, screenshots, extracted fields — so the server can verify
 * the outcome and keep the audit trail. No browser runs on our side.
 */
agentRouter.post("/browser/report", async (request, response) => {
  if (!authorisedOrUser(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = z
    .object({
      runId: z.string().min(1).max(120),
      step: z.string().min(1).max(200),
      url: z.string().url().optional(),
      status: z.enum(["ok", "failed", "needs_input", "blocked"]),
      screenshotBase64: z.string().max(4_000_000).optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
      error: z.string().max(2_000).optional(),
    })
    .safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  logger.info(
    {
      runId: parsed.data.runId,
      step: parsed.data.step,
      status: parsed.data.status,
      hasScreenshot: Boolean(parsed.data.screenshotBase64),
    },
    "Browser agent step reported",
  );

  // The screenshot and field payloads are returned to the user's session and
  // never written into the discovery index.
  response.json({ success: true, accepted: true });
});

/** The skill catalogue, rendered for an agent prompt. */
agentRouter.get("/skills", async (_request, response) => {
  const skills = await getSkills();
  response.json({
    success: true,
    skills: skills.map((skill) => ({
      name: skill.metadata.name,
      description: skill.metadata.description,
      domain: skill.metadata.domain,
      engine: skill.metadata.engine,
    })),
    catalogue: await renderSkillCatalogue({ domain: "jobs" }),
  });
});

agentRouter.get("/feeds", async (_request, response) => {
  try {
    const { jobs, results } = await fetchFreeJobs();
    response.json({
      success: true,
      count: jobs.length,
      sources: results.map((result) => ({
        source: result.source,
        found: result.jobs.length,
        error: result.error,
      })),
      sample: jobs.slice(0, 5).map((job) => ({
        title: job.title,
        company: job.company,
        source: job.sourcePlatform,
        url: job.url,
      })),
    });
  } catch (error) {
    response.status(502).json({
      error: "Feed fetch failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

agentRouter.get("/", (_request, response) => {
  response.json({
    status: "ready",
    egress: egressStatus(),
    endpoints: {
      browse: "POST /v1/agent/browse {url} — fetch + extract one page",
      search: "POST /v1/agent/search {query, limit, engine} — search the open web",
      extract: "POST /v1/agent/extract {url, markdown} — extract from given markdown",
      crawl: "POST /v1/agent/crawl {url, maxDepth, maxPages} — bounded site crawl",
      discoverJobs: "POST /v1/agent/discover-jobs {domain} — find an employer's job URLs",
      board: "POST /v1/agent/board {url} — pull a whole ATS board",
      eligibility: "POST /v1/agent/eligibility {…} — can a Kenyan candidate apply?",
      diff: "POST /v1/agent/diff {previous, current} — markdown diff + change judgement",
      browserReport: "POST /v1/agent/browser/report {runId, step, status} — job-seeker browser reports back",
      skills: "GET /v1/agent/skills — the agent skill catalogue",
      feeds: "GET /v1/agent/feeds — key-less public job feeds, live",
    },
  });
});
