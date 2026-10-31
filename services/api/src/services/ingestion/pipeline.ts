import { query } from "../../db/pool.js";
import {
  simhash,
  fingerprintInput,
} from "../opportunity/risk.js";

/**
 * Simple slugify utility used by document export filenames.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface IngestionStats {
  source: string;
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  error?: string;
}

/**
 * Shared deduplication utilities for the agent-based discovery system.
 *
 * Agents produce raw job candidates from across the web. Before a candidate
 * is promoted to the `opportunities` table, it must be deduplicated:
 *   - Within a batch: same fingerprint = same job (first occurrence wins)
 *   * Across batches: check if fingerprint already exists in `opportunities`
 *
 * These helpers are used by the DeduplicationAgent.
 */

export interface PreparedJob {
  externalId: string;
  title: string;
  description: string;
  country: string;
  city: string;
  workMode: string;
  seniority: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  applyUrl: string;
  applicationMethod: string;
  platform: string;
  postedAt: Date;
  skills: string[];
  simhash: string;
  fingerprint: string;
  companySlug: string;
  companyName: string;
  companyWebsite: string | null;
}

/**
 * Computes a fingerprint for a job candidate based on title, company,
 * city, and posted date. Same fingerprint = same job posting.
 */
export function computeFingerprint(
  company: string,
  title: string,
  city: string,
  postedAt: Date,
): string {
  return fingerprintInput({
    company,
    title,
    city,
    postedAt,
  });
}

/**
 * Computes a simhash for near-duplicate detection (same job posted with
 * slightly different titles across multiple platforms).
 */
export function computeSimhash(
  company: string,
  title: string,
  description: string,
): string {
  return simhash(`${company} ${title} ${description}`).toString();
}

/**
 * Checks whether a fingerprint already exists in the opportunities table.
 */
export async function fingerprintExists(
  fingerprints: string[],
): Promise<Set<string>> {
  if (fingerprints.length === 0) return new Set();
  const result = await query<{ fingerprint: string }>(
    `SELECT fingerprint FROM opportunities WHERE fingerprint = ANY($1::text[])`,
    [fingerprints],
  );
  return new Set(result.rows.map((row) => row.fingerprint));
}

/**
 * Checks whether a fingerprint already exists in discovery_candidates.
 */
export async function candidateFingerprintExists(
  fingerprints: string[],
): Promise<Set<string>> {
  if (fingerprints.length === 0) return new Set();
  const result = await query<{ fingerprint: string }>(
    `SELECT fingerprint FROM discovery_candidates WHERE fingerprint = ANY($1::text[])`,
    [fingerprints],
  );
  return new Set(result.rows.map((row) => row.fingerprint));
}
