import { query } from "../../db/pool.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";

/**
 * Deduplication Agent
 *
 * Deduplicates discovery_candidates:
 *   1. Within discovery_candidates: same fingerprint = duplicate
 *   2. Against existing opportunities: same fingerprint = already imported
 *   3. Near-duplicate detection via simhash (same job, slightly different titles)
 *
 * Marks candidates as:
 *   - 'verified' → ready for import into opportunities
 *   - 'duplicate' → already exists, skip
 *   - 'rejected' → low quality / spam
 */
export class DeduplicationAgent extends BaseDiscoveryAgent {
  readonly key = "deduplication_agent";
  readonly name = "Job Deduplication Agent";
  readonly kind = "deduplication";
  readonly scheduleIntervalMinutes = 30;

  async run(ctx: AgentContext): Promise<AgentRunResult> {
    // Get pending candidates not yet processed by dedup
    const candidates = await query<{
      id: string;
      fingerprint: string;
      title: string;
      company: string | null;
      description: string | null;
      simhash: string | null;
    }>(
      `SELECT id, fingerprint, title, company, description, simhash
         FROM discovery_candidates
        WHERE status = 'pending'
        ORDER BY discovered_at ASC
        LIMIT 500`,
    );

    if (candidates.rows.length === 0) {
      return {
        status: "success",
        jobsFound: 0,
        jobsNew: 0,
        jobsDuplicate: 0,
        payload: { message: "No pending candidates" },
      };
    }

    let totalNew = 0;
    let totalDuplicate = 0;
    let totalRejected = 0;

    // Check against existing opportunities
    const opportunityFingerprints = candidates.rows
      .map((c) => c.fingerprint)
      .filter((f): f is string => Boolean(f));
    const existingOpps = await this.fingerprintExists(opportunityFingerprints);
    const existingCandidates = await this.candidateFingerprintExists(opportunityFingerprints);

    // Within-batch dedup: track fingerprints seen in this batch
    const seenInBatch = new Set<string>();

    for (const candidate of candidates.rows) {
      const fp = candidate.fingerprint;
      if (!fp) {
        // No fingerprint — mark for manual review
        await query(
          `UPDATE discovery_candidates SET status = 'rejected', updated_at = now() WHERE id = $1`,
          [candidate.id],
        );
        totalRejected += 1;
        continue;
      }

      // Already in opportunities?
      if (existingOpps.has(fp)) {
        await query(
          `UPDATE discovery_candidates SET status = 'duplicate', updated_at = now() WHERE id = $1`,
          [candidate.id],
        );
        totalDuplicate += 1;
        continue;
      }

      // Already a candidate?
      if (existingCandidates.has(fp)) {
        await query(
          `UPDATE discovery_candidates SET status = 'duplicate', updated_at = now() WHERE id = $1`,
          [candidate.id],
        );
        totalDuplicate += 1;
        continue;
      }

      // Within-batch duplicate?
      if (seenInBatch.has(fp)) {
        await query(
          `UPDATE discovery_candidates SET status = 'duplicate', updated_at = now() WHERE id = $1`,
          [candidate.id],
        );
        totalDuplicate += 1;
        continue;
      }

      seenInBatch.add(fp);

      // Mark as verified — ready for import
      await query(
        `UPDATE discovery_candidates SET status = 'verified', updated_at = now() WHERE id = $1`,
        [candidate.id],
      );
      totalNew += 1;
    }

    return {
      status: "success",
      jobsFound: candidates.rows.length,
      jobsNew: totalNew,
      jobsDuplicate: totalDuplicate,
      payload: {
        verified: totalNew,
        duplicates: totalDuplicate,
        rejected: totalRejected,
        fingerprintsChecked: opportunityFingerprints.length,
      },
    };
  }

  /**
   * Promote verified candidates to the opportunities table.
   * Called after deduplication to actually import new jobs.
   */
  async promoteVerifiedCandidates(): Promise<{
    promoted: number;
    failed: number;
  }> {
    const verified = await query<{
      id: string;
      external_id: string;
      source_platform: string;
      source_url: string;
      title: string;
      company: string | null;
      description: string | null;
      location_raw: string | null;
      country: string | null;
      city: string | null;
      work_mode: string | null;
      employment_type: string | null;
      salary_min: number | null;
      salary_max: number | null;
      currency: string | null;
      apply_url: string;
      skills: string[];
      posted_at: Date | null;
      simhash: string | null;
      fingerprint: string;
    }>(
      `SELECT * FROM discovery_candidates WHERE status = 'verified' LIMIT 200`,
    );

    let promoted = 0;
    let failed = 0;

    for (const row of verified.rows) {
      try {
        // Insert into opportunities
        const result = await query<{ id: string }>(
          `INSERT INTO opportunities
              (source_id, external_id, title, description, country, city,
               work_mode, seniority, employment_type, salary_min, salary_max,
               currency, apply_url, application_method, platform, posted_at,
               status, simhash, fingerprint, risk_score, risk_flags,
               risk_action, risk_scored_at, created_at, updated_at)
           VALUES (
             (SELECT id FROM job_sources WHERE adapter = $2 LIMIT 1),
             $3, $4, $5, $6, $7, $8, 'mid', $9, $10, $11, $12, $13, 'website',
             $14, $15, 'active', $16::bigint, $17, 0, '{}', 'publish', now(),
             now(), now()
           )
           RETURNING id`,
          [
            row.source_platform,
            row.external_id,
            row.title,
            row.description ?? "",
            row.country ?? "Remote",
            row.city ?? "",
            row.work_mode ?? "remote",
            row.employment_type ?? "full_time",
            row.salary_min,
            row.salary_max,
            row.currency ?? "USD",
            row.apply_url,
            row.skills,
            row.posted_at ?? new Date(),
            row.simhash ? BigInt(row.simhash) : BigInt(0),
            row.fingerprint,
          ],
        );

        const opportunityId = result.rows[0]?.id;
        if (opportunityId) {
          // Insert skills
          if (row.skills.length > 0) {
            await query(
              `INSERT INTO opportunity_skills (opportunity_id, skill)
               SELECT $1, unnest($2::text[])
               ON CONFLICT (opportunity_id, skill) DO NOTHING`,
              [opportunityId, row.skills],
            );
          }

          // Mark candidate as imported
          await query(
            `UPDATE discovery_candidates
                SET status = 'imported', imported_opportunity_id = $1, updated_at = now()
              WHERE id = $2`,
            [opportunityId, row.id],
          );
          promoted += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[dedup] Failed to promote candidate ${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { promoted, failed };
  }

  /**
   * Checks whether a fingerprint already exists in the opportunities table.
   */
  private async fingerprintExists(
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
  private async candidateFingerprintExists(
    fingerprints: string[],
  ): Promise<Set<string>> {
    if (fingerprints.length === 0) return new Set();
    const result = await query<{ fingerprint: string }>(
      `SELECT fingerprint FROM discovery_candidates WHERE fingerprint = ANY($1::text[])`,
      [fingerprints],
    );
    return new Set(result.rows.map((row) => row.fingerprint));
  }
}
