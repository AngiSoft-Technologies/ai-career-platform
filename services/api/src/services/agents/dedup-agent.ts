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
    const batchIds = candidates.rows.map((c) => c.id);
    const opportunityFingerprints = candidates.rows
      .map((c) => c.fingerprint)
      .filter((f): f is string => Boolean(f));
    const existingOpps = await this.fingerprintExists(opportunityFingerprints);
    // Exclude this batch's own rows: otherwise a candidate matches itself and
    // every single one is classified as a duplicate, so nothing is ever
    // promoted. Within-batch duplicates are handled by `seenInBatch` below.
    const existingCandidates = await this.candidateFingerprintExists(
      opportunityFingerprints,
      batchIds,
    );

    // Within-batch dedup: track fingerprints seen in this batch
    const seenInBatch = new Set<string>();

    // The classification is computed here and written in one statement.
    // Doing it one row at a time meant five hundred round trips to the
    // database for one batch, and this agent runs on every ingestion cycle.
    const decisions: Array<{ id: string; status: string }> = [];

    for (const candidate of candidates.rows) {
      const fp = candidate.fingerprint;
      if (!fp) {
        // No fingerprint — mark for manual review
        decisions.push({ id: candidate.id, status: "rejected" });
        totalRejected += 1;
        continue;
      }

      // Already in opportunities?
      if (existingOpps.has(fp)) {
        decisions.push({ id: candidate.id, status: "duplicate" });
        totalDuplicate += 1;
        continue;
      }

      // Already a candidate?
      if (existingCandidates.has(fp)) {
        decisions.push({ id: candidate.id, status: "duplicate" });
        totalDuplicate += 1;
        continue;
      }

      // Within-batch duplicate?
      if (seenInBatch.has(fp)) {
        decisions.push({ id: candidate.id, status: "duplicate" });
        totalDuplicate += 1;
        continue;
      }

      seenInBatch.add(fp);

      // Mark as verified — ready for import
      decisions.push({ id: candidate.id, status: "verified" });
      totalNew += 1;
    }

    if (decisions.length > 0) {
      await query(
        `UPDATE discovery_candidates dc
            SET status = t.status, updated_at = now()
           FROM unnest($1::uuid[], $2::text[]) AS t(id, status)
          WHERE dc.id = t.id`,
        [
          decisions.map((decision) => decision.id),
          decisions.map((decision) => decision.status),
        ],
      );
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
   *
   * This is done in three statements rather than four per candidate. With
   * a few hundred verified candidates the round-trip version spent minutes
   * in the database, and the promotion is the step that actually puts jobs
   * in front of a user — it cannot be the slow part of the cycle.
   */
  async promoteVerifiedCandidates(): Promise<{
    promoted: number;
    failed: number;
  }> {
    const limit = 400;
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
      `SELECT * FROM discovery_candidates WHERE status = 'verified' LIMIT $1`,
      [limit],
    );

    if (verified.rows.length === 0) {
      return { promoted: 0, failed: 0 };
    }

    let promoted = 0;
    let failed = 0;

    try {
      // 1. Companies. `opportunities.company_id` is NOT NULL and discovered
      //    jobs come from arbitrary employers, so the employer is upserted
      //    first. The slug is unique, so one statement covers them all.
      const payloads: Array<Record<string, unknown>> = [];
      const companyNames: string[] = [];
      const companySlugs: string[] = [];

      for (const row of verified.rows) {
        const companyName =
          (row.company ?? "Unknown employer").trim() || "Unknown employer";
        const slug =
          companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || `company-${row.id.slice(0, 8)}`;

        if (!companySlugs.includes(slug)) {
          companySlugs.push(slug);
          companyNames.push(companyName.slice(0, 200));
        }

        const simhash =
          row.simhash && /^\d+$/.test(row.simhash) ? row.simhash : "0";

        payloads.push({
          candidate_id: row.id,
          company_slug: slug,
          source_platform: row.source_platform,
          source_url: `https://${row.source_platform}.com`,
          external_id: row.external_id
            ? `${row.external_id}${row.source_url}`
            : row.source_url,
          title: row.title,
          description: row.description ?? "",
          country: row.country ?? "Remote",
          city: row.city ?? "",
          work_mode: row.work_mode ?? "remote",
          employment_type: row.employment_type ?? "full_time",
          salary_min: row.salary_min,
          salary_max: row.salary_max,
          currency: row.currency ?? "USD",
          apply_url: row.apply_url ?? row.source_url,
          posted_at: row.posted_at ? new Date(row.posted_at).toISOString() : null,
          simhash,
          fingerprint: row.fingerprint,
          skills: row.skills ?? [],
        });
      }

      await query(
        `INSERT INTO companies (name, slug)
         SELECT * FROM unnest($1::text[], $2::text[])
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
        [companyNames, companySlugs],
      );

      // 2. Opportunities, and the link back to the candidate, in one
      //    statement. The insert returns the rows it created, so the
      //    candidate that produced each one is known exactly.
      const inserted = await query<{
        candidate_id: string;
        opportunity_id: string;
      }>(
        `WITH payload AS (
           SELECT value AS p FROM jsonb_array_elements($1::jsonb)
         ), created AS (
           INSERT INTO opportunities
             (company_id, source_id, external_id, title, description, country, city,
              work_mode, seniority, employment_type, salary_min, salary_max,
              currency, apply_url, application_method, platform, posted_at,
              status, simhash, fingerprint, risk_score, risk_flags,
              risk_action, risk_scored_at, created_at, updated_at)
           SELECT
             c.id,
             (SELECT id FROM job_sources
               WHERE type = 'aggregator' AND url = p->>'source_url' LIMIT 1),
             p->>'external_id',
             p->>'title',
             p->>'description',
             p->>'country',
             p->>'city',
             p->>'work_mode',
             'mid',
             p->>'employment_type',
             (p->>'salary_min')::numeric,
             (p->>'salary_max')::numeric,
             p->>'currency',
             p->>'apply_url',
             'website',
             p->>'source_platform',
             COALESCE((p->>'posted_at')::timestamptz, now()),
             'active',
             (p->>'simhash')::bigint,
             p->>'fingerprint',
             0,
             '{}'::text[],
             'publish',
             now(),
             now(),
             now()
           FROM payload p
           JOIN companies c ON c.slug = p->>'company_slug'
           ON CONFLICT DO NOTHING
           RETURNING id, external_id
         )
         UPDATE discovery_candidates dc
            SET status = 'imported',
                imported_opportunity_id = created.id,
                updated_at = now()
           FROM created
          WHERE created.external_id = coalesce(dc.external_id, '') || dc.source_url
            AND dc.id = ANY($2::uuid[])
         RETURNING dc.id AS candidate_id, created.id AS opportunity_id`,
        [JSON.stringify(payloads), verified.rows.map((row) => row.id)],
      );

      promoted = inserted.rowCount ?? 0;

      // 3. Skills for the rows that were just created.
      const promotedPairs = new Map<string, string>();
      for (const row of inserted.rows) {
        promotedPairs.set(row.candidate_id, row.opportunity_id);
      }
      const skillPayloads = verified.rows
        .filter((row) => promotedPairs.has(row.id) && row.skills.length > 0)
        .map((row) => ({
          opportunity_id: promotedPairs.get(row.id),
          skills: row.skills,
        }));

      if (skillPayloads.length > 0) {
        await query(
          `INSERT INTO opportunity_skills (opportunity_id, skill)
           SELECT o.id, s.skill
             FROM jsonb_array_elements($1::jsonb) AS p(value)
             JOIN opportunities o ON o.id = (p.value->>'opportunity_id')::uuid
             CROSS JOIN LATERAL jsonb_array_elements_text(p.value->'skills') AS s(skill)
           ON CONFLICT (opportunity_id, skill) DO NOTHING`,
          [JSON.stringify(skillPayloads)],
        );
      }

      // A candidate whose opportunity already existed is a duplicate, not a
      // failure. It would otherwise be picked up again on every cycle.
      await query(
        `UPDATE discovery_candidates
            SET status = 'duplicate', updated_at = now()
          WHERE id = ANY($1::uuid[])
            AND status = 'verified'`,
        [verified.rows.map((row) => row.id)],
      );
    } catch (error) {
      failed = verified.rows.length;
      console.error(
        `[dedup] Failed to promote ${verified.rows.length} candidates: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
   * Checks whether a fingerprint already exists in a discovery candidate we
   * are *not* currently deciding on. Rows in the current batch are excluded —
   * otherwise every candidate trivially matches itself and nothing verifies.
   */
  private async candidateFingerprintExists(
    fingerprints: string[],
    excludeIds: string[],
  ): Promise<Set<string>> {
    if (fingerprints.length === 0) return new Set();
    const result = await query<{ fingerprint: string }>(
      `SELECT fingerprint
         FROM discovery_candidates
        WHERE fingerprint = ANY($1::text[])
          AND NOT (id = ANY($2::uuid[]))`,
      [fingerprints, excludeIds],
    );
    return new Set(result.rows.map((row) => row.fingerprint));
  }
}
