/**
 * Ingestion module — agent-based job discovery.
 *
 * No hardcoded source adapters. Agents discover jobs dynamically through
 * search engines across ALL platforms.
 *
 * Discovery is handled entirely by agents registered in `discovery_agents`
 * and run by `services/agents/runner.ts`.
 */

export type { IngestionStats } from "./pipeline.js";
