import { query, withTransaction } from "../../db/pool.js";
import { BaseDiscoveryAgent, type AgentContext, type AgentRunResult } from "./base.js";
import {
  canonicalCompanyKey,
  companySlug,
  normaliseCompanyName,
  rawCompanyKey,
} from "../engine/company.js";

/**
 * The statement that claims the candidates a promotion is going to work
 * on.
 *
 * `FOR UPDATE SKIP LOCKED` is the whole point of it. The promotion runs
 * from the ingestion tick *and* from the internal route, on eleven
 * machines, and until now nothing stopped two of them from reading the
 * same candidate. Both would then create an opportunity for it: 604 such
 * pairs sat in the catalogue, each written by two transactions a
 * fraction of a millisecond apart.
 *
 * `SKIP LOCKED` makes the second promoter walk past the rows the first
 * one is holding rather than waiting for them — so the work is done once
 * and the second promoter simply finds less to do.
 */
export const PROMOTION_CLAIM_SQL = `SELECT * FROM discovery_candidates
     WHERE status = 'verified'
     ORDER BY discovered_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`;

/**
 * The statement that writes the skills of a freshly promoted job.
 */
export const SKILL_INSERT_SQL = `INSERT INTO opportunity_skills (opportunity_id, skill)
     SELECT o.id, s.skill
       FROM jsonb_array_elements($1::jsonb) AS p(value)
       JOIN opportunities o ON o.id = (p.value->>'opportunity_id')::uuid
       CROSS JOIN LATERAL jsonb_array_elements_text(p.value->'skills') AS s(skill)
     ON CONFLICT (opportunity_id, skill) DO NOTHING`;

/**
 * The statement that creates the opportunities and links them back to the
 * candidates that produced them.
 *
 * It is exported so the regression verifier can run *this* statement
 * against a live database — inside a transaction it rolls back — rather
 * than a copy of it that can drift away from the one that runs in
 * production.
 *
 * The link back to the candidate is made on the candidate's **id**, not on
 * a string built out of the external id and the URL. The string form was
 * a place where a promotion could silently attach an opportunity to the
 * wrong candidate, and — because the external id is often the URL itself
 * — a place where the same candidate could be attached twice.
 */
export const PROMOTION_SQL = `WITH payload AS (
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
   JOIN payload p ON created.external_id = p->>'external_id'
  WHERE p->>'candidate_id' = dc.id::text
    AND dc.id = ANY($2::uuid[])
 RETURNING dc.id AS candidate_id, created.id AS opportunity_id`;

/**
 * The identity of a posting at its source.
 *
 * A candidate carries two things: the identifier the source gave the
 * posting, and the URL it was read from. The identifier is often absent,
 * and the extractor falls back to the URL — so the two are frequently the
 * same string.
 *
 * Appending the URL unconditionally therefore produced the URL twice:
 * "https://workghana.net/jobs/sales-executive…https://workghana.net/jobs/
 * sales-executive…", 130 characters of the same address, on 225 rows of
 * the catalogue. The URL is appended only when the source gave an
 * identifier of its own, because the URL is what makes the identity
 * unique: `discovery_candidates.source_url` is unique, so an identity
 * that contains it identifies exactly one posting.
 */
export function opportunityIdentity(
  externalId: string | null | undefined,
  sourceUrl: string,
): string {
  const id = (externalId ?? "").trim();
  if (!id || id === sourceUrl || id === "undefined") return sourceUrl;
  return `${id}${sourceUrl}`;
}

/**
 * The posting's own address.
 *
 * The address a posting is applied to and the address it was found at
 * are the same page in every case that matters, and the address is
 * compared without its trailing slash and without its case.
 */
export function addressOf(
  applyUrl: string | null | undefined,
  sourceUrl: string | null | undefined,
): string | null {
  const raw = applyUrl ?? sourceUrl;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname
      .replace(/\/+$/, "")
      .toLowerCase()}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "");
  }
}

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
      apply_url: string | null;
      source_url: string | null;
    }>(
      `SELECT id, fingerprint, title, company, description, simhash,
              apply_url, source_url
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

    // The same posting, under another employer's name.
    //
    // The fingerprint is the employer's name, the title, the city and
    // the date — so the same posting read from a board and read from a
    // search result has two fingerprints when the two pages name the
    // employer differently, and the second one is promoted as though it
    // were a new role.
    //
    // The address does not change: it is the same page, and the
    // catalogue holds one row per page. So the address is checked too,
    // and a posting that is already in the catalogue is a duplicate
    // whatever the two pages called it.
    const candidateAddresses = candidates.rows
      .map((candidate) => addressOf(candidate.apply_url, candidate.source_url))
      .filter((address): address is string => Boolean(address));
    const existingAddresses = await this.addressExists(candidateAddresses);
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

      // The same posting, already in the catalogue under another name.
      const address = addressOf(candidate.apply_url, candidate.source_url);
      if (address && existingAddresses.has(address)) {
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
   *
   * The three statements run in **one transaction**, and the candidates
   * are claimed in it. That is not tidiness: the promotion is run by the
   * ingestion tick *and* by the internal route, on eleven machines, and
   * until now nothing stopped the two from reading the same verified
   * candidate. Both would then create an opportunity for it, and the
   * catalogue filled up with the same job twice — 604 such pairs, each
   * written by two transactions a fraction of a millisecond apart.
   *
   * `FOR UPDATE SKIP LOCKED` is what ends the race: the second promoter
   * walks past the rows the first one is holding rather than waiting for
   * them. The unique constraint on `(source_id, external_id)` is the
   * second line of defence, and it only bites because the migration that
   * cleaned the duplicates made it treat a null source as a value.
   */
  async promoteVerifiedCandidates(): Promise<{
    promoted: number;
    failed: number;
  }> {
    const limit = 400;
    let promoted = 0;
    let attempted = 0;
    let failed = 0;

    try {
      await withTransaction(async (client) => {
        // 0. Claim the candidates. The lock is held until the
        //    transaction ends, so no other promotion can take them.
        const verified = await client.query<{
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
          PROMOTION_CLAIM_SQL,
          [limit],
        );

        if (verified.rows.length === 0) return;
        attempted = verified.rows.length;

        // 1. Companies. `opportunities.company_id` is NOT NULL and discovered
        //    jobs come from arbitrary employers, so the employer is written
        //    first.
        //
        //    The employer's *identity* is its canonical key — "kcbbank"
        //    for "KCB Bank" and for "Kcb Bank" alike — and that key is
        //    what the row carries and what the database refuses to let
        //    two rows share. The slug is the readable form the row is
        //    known by, and it is left alone: the employer's page keeps
        //    the address it has always had.
        const payloads: Array<Record<string, unknown>> = [];

        // The employer, once: the name it is displayed under, the slug
        // it is known by, and the key that says which employer it is.
        const employers = new Map<
          string,
          { name: string; slug: string; key: string }
        >();

        for (const row of verified.rows) {
          // The employer's name is normalised on the way in, so one
          // employer has one name however the page spelled it.
          //
          // A name that cannot be an employer at all (a job title, a
          // page heading, the board's name) keeps its raw form rather
          // than being thrown away: the posting is real, and a wrong
          // name is better than no name. The extraction refuses those
          // names at the source, so this only applies to rows that were
          // written before the rule existed.
          const rawName = (row.company ?? "").trim();
          const companyName =
            normaliseCompanyName(rawName) ?? rawName.slice(0, 200);
          const displayName = (companyName || "Unknown employer").slice(0, 200);
          const key =
            canonicalCompanyKey(companyName) ||
            rawCompanyKey(rawName) ||
            canonicalCompanyKey("Unknown employer");
          const slug =
            companySlug(companyName) ||
            companySlug("Unknown employer") ||
            `company-${row.id.slice(0, 8)}`;

          if (!employers.has(key)) {
            employers.set(key, { name: displayName, slug, key });
          }

          const simhash =
            row.simhash && /^\d+$/.test(row.simhash) ? row.simhash : "0";

          payloads.push({
            candidate_id: row.id,
            company_slug: slug,
            company_key: key,
            source_platform: row.source_platform,
            source_url: `https://${row.source_platform}.com`,
            external_id: opportunityIdentity(row.external_id, row.source_url),
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
            posted_at: row.posted_at
              ? new Date(row.posted_at).toISOString()
              : null,
            simhash,
            fingerprint: row.fingerprint,
            skills: row.skills ?? [],
          });
        }

        // The employer rows are written once.
        //
        // The *name* is not rewritten on every promotion. It used to be:
        // `DO UPDATE SET name = EXCLUDED.name` meant the last writer
        // decided what the employer is called, and with three spellings
        // in play the label on the employer's row changed from one cycle
        // to the next. A catalogue that renames its employers between
        // pages is a catalogue nobody can trust.
        //
        // The first name written is the one kept. The discovery side is
        // where the name is made right, and it is made right before the
        // row is ever created.
        //
        // The lookup comes first. An employer that is already in the
        // catalogue keeps the row it has, under the slug it is known by;
        // only an employer that is not there yet is written. The row
        // carries the employer's canonical key, and the unique index on
        // that key is what stops a second row from appearing for one
        // employer.
        const employerKeys = [...employers.keys()];
        const employerSlugs = [...employers.values()].map(
          (employer) => employer.slug,
        );

        // The employers that are already in the catalogue, found by their
        // identity first and by their slug second.
        const findEmployers = async (): Promise<{
          byKey: Map<string, string>;
          bySlug: Map<string, string>;
        }> => {
          const known = await client.query<{
            id: string;
            slug: string;
            canonical_key: string | null;
          }>(
            `SELECT id, slug, canonical_key
               FROM companies
              WHERE canonical_key = ANY($1::text[])
                 OR slug = ANY($2::text[])`,
            [employerKeys, employerSlugs],
          );

          const byKey = new Map<string, string>();
          const bySlug = new Map<string, string>();
          for (const row of known.rows) {
            if (row.canonical_key) byKey.set(row.canonical_key, row.slug);
            bySlug.set(row.slug, row.slug);
          }
          return { byKey, bySlug };
        };

        const { byKey, bySlug } = await findEmployers();

        const missingNames: string[] = [];
        const missingSlugs: string[] = [];
        const missingKeys: string[] = [];

        for (const employer of employers.values()) {
          const knownSlug = byKey.get(employer.key) ?? bySlug.get(employer.slug);
          if (knownSlug) {
            employer.slug = knownSlug;
            continue;
          }

          missingNames.push(employer.name);
          missingSlugs.push(employer.slug);
          missingKeys.push(employer.key);
        }

        if (missingNames.length > 0) {
          await client.query(
            `INSERT INTO companies (name, slug, canonical_key)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
             ON CONFLICT DO NOTHING`,
            [missingNames, missingSlugs, missingKeys],
          );
        }

        // A slug that is already taken by a *different* employer — two
        // long names that share their first eighty characters — leaves
        // the employer without a row, and the promotion would then write
        // no opportunity for it at all. The identity is the key, so the
        // slug is given a suffix and the row is written under it.
        const afterInsert = await findEmployers();
        const unresolved = [...employers.values()].filter(
          (employer) =>
            !afterInsert.byKey.has(employer.key) &&
            !afterInsert.bySlug.has(employer.slug),
        );

        if (unresolved.length > 0) {
          const fallbackNames: string[] = [];
          const fallbackSlugs: string[] = [];
          const fallbackKeys: string[] = [];

          for (const employer of unresolved) {
            const slug = `${employer.slug.slice(0, 70)}-${employer.key.slice(0, 8)}`;
            fallbackNames.push(employer.name);
            fallbackSlugs.push(slug);
            fallbackKeys.push(employer.key);
            employer.slug = slug;
          }

          await client.query(
            `INSERT INTO companies (name, slug, canonical_key)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
             ON CONFLICT DO NOTHING`,
            [fallbackNames, fallbackSlugs, fallbackKeys],
          );
        }

        // The payload names the employer by the slug its row actually has.
        for (const payload of payloads) {
          const employer = employers.get(payload.company_key as string);
          if (employer) payload.company_slug = employer.slug;
        }

        // 2. Opportunities, and the link back to the candidate, in one
        //    statement. The insert returns the rows it created, so the
        //    candidate that produced each one is known exactly.
        const inserted = await client.query<{
          candidate_id: string;
          opportunity_id: string;
        }>(PROMOTION_SQL, [
          JSON.stringify(payloads),
          verified.rows.map((row) => row.id),
        ]);

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
          await client.query(SKILL_INSERT_SQL, [JSON.stringify(skillPayloads)]);
        }

        // A candidate whose opportunity already existed is a duplicate, not a
        // failure. It would otherwise be picked up again on every cycle.
        await client.query(
          `UPDATE discovery_candidates
              SET status = 'duplicate', updated_at = now()
            WHERE id = ANY($1::uuid[])
              AND status = 'verified'`,
          [verified.rows.map((row) => row.id)],
        );
      });
    } catch (error) {
      failed = attempted;
      console.error(
        `[dedup] Failed to promote ${attempted} candidates: ${
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
   * Checks whether an address is already in the opportunities table.
   *
   * The address is the posting's own page, and the catalogue holds one
   * row per page: the address is the one thing that says "this is the
   * same posting" when the employer's name is written differently on
   * two pages.
   */
  private async addressExists(addresses: string[]): Promise<Set<string>> {
    if (addresses.length === 0) return new Set();
    const result = await query<{ apply_url: string }>(
      `SELECT apply_url FROM opportunities
        WHERE lower(rtrim(apply_url, '/')) = ANY($1::text[])`,
      [addresses.map((address) => address.replace(/\/+$/, ""))],
    );
    return new Set(
      result.rows.map((row) => row.apply_url.trim().toLowerCase().replace(/\/+$/, "")),
    );
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
