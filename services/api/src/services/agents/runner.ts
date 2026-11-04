import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";
import { BaseDiscoveryAgent, type AgentRunResult } from "./base.js";
import { SearchEngineAgent } from "./search-agent.js";
import { BrowseAgent } from "./browse-agent.js";
import { DeduplicationAgent } from "./dedup-agent.js";
import { UserMatchingAgent } from "./match-agent.js";
import { LearningAgent } from "./learning-agent.js";
import { DirectSourcesAgent } from "./sources-agent.js";
import { ExpansionAgent } from "./expansion-agent.js";
import { KenyaPlatformAgent } from "./kenya-agent.js";

/**
 * Agent registry — all agents registered here.
 *
 * None of these agents depends on a vendor API or a hardcoded list of job
 * boards. Discovery works by search-engine probing, following ATS boards,
 * crawling careers pages and sitemaps, and learning which sources pay off.
 *
 * The registry is split into two phases, because the order matters:
 *
 *   • **Discovery** finds candidates. It has to run before promotion.
 *   • **Post-promotion** works on the catalogue — the matching agent
 *     stores an opportunity id in `matches`, and `matches.opportunity_id`
 *     is a foreign key to `opportunities`. A match for a candidate that
 *     has not been promoted cannot be stored at all, so the matching
 *     agent runs after promotion, not before it.
 */
const DISCOVERY_AGENT_CLASSES: { new (): BaseDiscoveryAgent }[] = [
  DirectSourcesAgent,
  SearchEngineAgent,
  BrowseAgent,
  ExpansionAgent,
  KenyaPlatformAgent,
  LearningAgent,
];

const POST_PROMOTION_AGENT_CLASSES: { new (): BaseDiscoveryAgent }[] = [
  UserMatchingAgent,
];

/** Every registered agent, in both phases. */
const AGENT_CLASSES: { new (): BaseDiscoveryAgent }[] = [
  ...DISCOVERY_AGENT_CLASSES,
  ...POST_PROMOTION_AGENT_CLASSES,
  DeduplicationAgent,
];

/**
 * Instantiates all registered agents and loads their config from the DB.
 */
async function loadAgents(
  classes: { new (): BaseDiscoveryAgent }[],
): Promise<BaseDiscoveryAgent[]> {
  const agents: BaseDiscoveryAgent[] = [];
  for (const cls of classes) {
    const agent = new cls();
    await agent.loadConfig();
    agents.push(agent);
  }
  return agents;
}

/**
 * Runs all active discovery agents whose next_run_at is due.
 *
 * This is called from runIngestion() on every scheduler tick (default 30 min).
 * Each agent runs independently and reports its own results.
 */
export async function runDiscoveryAgents(): Promise<{
  status: "success" | "partial" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  error?: string;
}> {
  let agents: BaseDiscoveryAgent[];
  try {
    agents = await loadAgents(DISCOVERY_AGENT_CLASSES);
  } catch (error) {
    logger.error({ error }, "Failed to load discovery agents");
    return {
      status: "failed",
      fetched: 0,
      inserted: 0,
      updated: 0,
      failed: 1,
      error: error instanceof Error ? error.message : "AGENT_LOAD_FAILED",
    };
  }

  const now = new Date();

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let anyError = false;

  for (const agent of agents) {
    // Check if agent is due to run. `agentId` must be the row UUID: the
    // discovery tables use uuid foreign keys, not the agent's text key.
    const result = await query<{
      id: string;
      next_run_at: Date | null;
      status: string;
    }>(
      `SELECT id, next_run_at, status FROM discovery_agents WHERE key = $1`,
      [agent.key],
    );

    const row = result.rows[0];
    if (!row) continue;
    if (row.status !== "active") continue;
    if (row.next_run_at && row.next_run_at > now) continue;

    let runResult: AgentRunResult;
    try {
      runResult = await agent.run({
        agentId: row.id,
        agentKey: agent.key,
        config: agent.agentConfig,
      });
      await agent.recordRun(runResult);
    } catch (error) {
      runResult = {
        status: "failed",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      try {
        await agent.recordRun(runResult);
      } catch {
        // Best effort recording
      }
      anyError = true;
    }

    totalFetched += runResult.jobsFound;
    totalInserted += runResult.jobsNew;
    totalUpdated += runResult.jobsDuplicate;
    totalFailed += runResult.status === "failed" ? 1 : 0;

    logger.info(
      {
        agent: agent.key,
        status: runResult.status,
        jobsFound: runResult.jobsFound,
        jobsNew: runResult.jobsNew,
        jobsDuplicate: runResult.jobsDuplicate,
        error: runResult.error,
      },
      "Discovery agent run completed",
    );
  }

  return {
    status: anyError ? "partial" : "success",
    fetched: totalFetched,
    inserted: totalInserted,
    updated: totalUpdated,
    failed: totalFailed,
    error: anyError ? "Some agents failed" : undefined,
  };
}

/**
 * Runs the agents that work on the catalogue.
 *
 * These run after promotion, not before it: the matching agent stores an
 * opportunity id in `matches`, and `matches.opportunity_id` is a foreign
 * key to `opportunities`. Matching a candidate that has not been promoted
 * yet cannot be stored, so the phase has to come second.
 */
export async function runPostPromotionAgents(): Promise<{
  status: "success" | "partial" | "failed";
  fetched: number;
  inserted: number;
  failed: number;
  error?: string;
}> {
  let agents: BaseDiscoveryAgent[];
  try {
    agents = await loadAgents(POST_PROMOTION_AGENT_CLASSES);
  } catch (error) {
    logger.error({ error }, "Failed to load post-promotion agents");
    return {
      status: "failed",
      fetched: 0,
      inserted: 0,
      failed: 1,
      error: error instanceof Error ? error.message : "AGENT_LOAD_FAILED",
    };
  }

  const now = new Date();

  let totalFetched = 0;
  let totalInserted = 0;
  let totalFailed = 0;
  let anyError = false;

  for (const agent of agents) {
    const result = await query<{
      id: string;
      next_run_at: Date | null;
      status: string;
    }>(
      `SELECT id, next_run_at, status FROM discovery_agents WHERE key = $1`,
      [agent.key],
    );

    const row = result.rows[0];
    if (!row) continue;
    if (row.status !== "active") continue;
    if (row.next_run_at && row.next_run_at > now) continue;

    let runResult: AgentRunResult;
    try {
      runResult = await agent.run({
        agentId: row.id,
        agentKey: agent.key,
        config: agent.agentConfig,
      });
      await agent.recordRun(runResult);
    } catch (error) {
      runResult = {
        status: "failed",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      try {
        await agent.recordRun(runResult);
      } catch {
        // Best effort recording
      }
      anyError = true;
    }

    totalFetched += runResult.jobsFound;
    totalInserted += runResult.jobsNew;
    totalFailed += runResult.status === "failed" ? 1 : 0;

    logger.info(
      {
        agent: agent.key,
        status: runResult.status,
        jobsFound: runResult.jobsFound,
        jobsNew: runResult.jobsNew,
        error: runResult.error,
      },
      "Post-promotion agent run completed",
    );
  }

  return {
    status: anyError ? "partial" : "success",
    fetched: totalFetched,
    inserted: totalInserted,
    failed: totalFailed,
    error: anyError ? "Some agents failed" : undefined,
  };
}

/**
 * Returns the list of all registered agents with their current status.
 */
export async function listRegisteredAgents(): Promise<Array<{
  key: string;
  name: string;
  kind: string;
  status: string;
  scheduleIntervalMinutes: number;
  nextRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunJobsFound: number;
}>> {
  const result = await query<{
    key: string;
    name: string;
    kind: string;
    status: string;
    schedule_interval_minutes: number;
    next_run_at: Date | null;
    last_run_status: string | null;
    last_run_jobs_found: number;
  }>(
    `SELECT key, name, kind, status, schedule_interval_minutes,
            next_run_at, last_run_status, last_run_jobs_found
       FROM discovery_agents
      ORDER BY key ASC`,
  );

  return result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    kind: row.kind,
    status: row.status,
    scheduleIntervalMinutes: row.schedule_interval_minutes,
    nextRunAt: row.next_run_at,
    lastRunStatus: row.last_run_status,
    lastRunJobsFound: row.last_run_jobs_found,
  }));
}

/**
 * Returns all agent classes for the registry (used by API endpoints).
 */
export function getAgentClasses(): { new (): BaseDiscoveryAgent }[] {
  return AGENT_CLASSES;
}

export type { BaseDiscoveryAgent, AgentRunResult } from "./base.js";
