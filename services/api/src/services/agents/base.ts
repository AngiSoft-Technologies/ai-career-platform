import { query } from "../../db/pool.js";
import { logger } from "../../logger.js";

/**
 * Base class for all discovery agents.
 *
 * Agents are background micro-services that run on a schedule and discover
 * job opportunities across the ENTIRE web using search engines — not
 * hardcoded source lists. Each agent:
 *   1. Runs on its own interval (discovery_agents.schedule_interval_minutes)
 *   2. Produces results stored in discovery tables
 *   3. Reports run metrics to discovery_agent_runs
 *
 * New platforms (LinkedIn, Facebook, NGO sites, company career pages,
 * Twitter, job boards) are discovered dynamically through search queries,
 * not through a fixed adapter registry.
 */

export interface AgentContext {
  agentId: string;
  agentKey: string;
  config: Record<string, unknown>;
}

export interface AgentRunResult {
  status: "success" | "partial" | "failed";
  jobsFound: number;
  jobsNew: number;
  jobsDuplicate: number;
  error?: string;
  payload?: Record<string, unknown>;
}

export abstract class BaseDiscoveryAgent {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly kind: string;
  abstract readonly scheduleIntervalMinutes: number;

  protected config: Record<string, unknown> = {};

  abstract run(ctx: AgentContext): Promise<AgentRunResult>;

  async recordRun(result: AgentRunResult): Promise<void> {
    const client = await query("BEGIN");
    try {
      await query(
        `INSERT INTO discovery_agent_runs
            (agent_id, started_at, finished_at, status, jobs_found, jobs_new, jobs_duplicate, error, payload)
         VALUES ($1, now(), now(), $2, $3, $4, $5, $6, $7)`,
        [
          this.key,
          result.status,
          result.jobsFound,
          result.jobsNew,
          result.jobsDuplicate,
          result.error ?? null,
          JSON.stringify(result.payload ?? {}),
        ],
      );

      await query(
        `UPDATE discovery_agents
            SET last_run_at = now(),
                last_run_status = $2,
                last_run_jobs_found = $3,
                next_run_at = now() + interval '${this.scheduleIntervalMinutes} minutes',
                updated_at = now()
          WHERE key = $1`,
        [this.key, result.status, result.jobsFound],
      );

      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      logger.error(
        { agent: this.key, error },
        "Failed to record discovery agent run",
      );
    }
  }

  async loadConfig(): Promise<void> {
    const result = await query<{ config: Record<string, unknown> }>(
      `SELECT config FROM discovery_agents WHERE key = $1`,
      [this.key],
    );
    if (result.rows.length > 0) {
      const cfg = result.rows[0]!.config as Record<string, unknown> | null;
      if (cfg) this.config = cfg;
    }
  }

  get agentConfig(): Record<string, unknown> {
    return this.config;
  }
}
