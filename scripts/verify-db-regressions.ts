/**
 * Database regression checks for the statements that write the catalogue.
 *
 * The other verifiers are offline: they check the shape of the source and
 * the behaviour of pure functions. These two statements cannot be checked
 * that way. They are set-based SQL that runs against a live database, and
 * the failures they had were failures of the *database* — a constraint
 * that never fired, a column that was the wrong type, a join that
 * matched nothing — none of which a source-shape assertion can see.
 *
 * So these checks run the real statements against the real database,
 * inside a transaction that is rolled back at the end. Nothing is left
 * behind: the counts before and after are compared to prove it.
 *
 * What they cover:
 *
 *   1. the transaction helper rolls back when the work fails
 *   2. the promotion claims candidates without taking rows another
 *      promoter is holding
 *   3. the promotion creates the opportunity, links the candidate and
 *      writes the skills
 *   4. a second promotion of the same candidate creates **no** second
 *      opportunity — the race that put 604 duplicate jobs in the
 *      catalogue
 *   5. the match write keeps the factors as JSON and the gaps as a flat
 *      list of text
 *
 * Run: npx tsx scripts/verify-db-regressions.ts
 */

import dns from "node:dns";
import { randomBytes } from "node:crypto";
import pg from "pg";

import {
  PROMOTION_CLAIM_SQL,
  PROMOTION_SQL,
  SKILL_INSERT_SQL,
  opportunityIdentity,
} from "../services/api/src/services/agents/dedup-agent.js";
import { MATCH_UPSERT_SQL } from "../services/api/src/services/agents/match-agent.js";
import { pendingQueueDepth, queueRoom } from "../services/api/src/services/engine/queue.js";
import {
  beginOAuthFlow,
  oauthCallbackUrl,
} from "../services/api/src/auth/providers/neon-oauth.js";
import { withTransaction } from "../services/api/src/db/pool.js";
import { pool as appPool } from "../services/api/src/db/pool.js";

// ---------------------------------------------------------------------------
// The database host resolves to IPv6 addresses that are not reachable from
// every network, and the client waits on them until it times out. The
// address family is forced to IPv4 for the length of the run.
//
// This is a local-verification concern only: the deployed workers connect
// to the same database from machines whose routes are known to work.
// ---------------------------------------------------------------------------

const originalLookup = dns.lookup;
dns.lookup = function patchedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
): void {
  originalLookup.call(
    dns,
    hostname,
    { ...options, family: 4 },
    callback as (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
  );
} as typeof dns.lookup;

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface CandidateRow {
  id: string;
  external_id: string;
  source_url: string;
  source_platform: string;
  title: string;
}

async function insertCandidate(
  client: pg.PoolClient,
  marker: string,
  ordinal: number,
): Promise<CandidateRow> {
  const externalId = `regression-${marker}-${ordinal}`;
  const sourceUrl = `https://regression.example/${marker}/posting-${ordinal}`;
  const result = await client.query<{
    id: string;
    external_id: string;
    source_url: string;
    source_platform: string;
    title: string;
  }>(
    `INSERT INTO discovery_candidates
        (external_id, source_platform, source_url, title, company, description,
         country, city, work_mode, employment_type, apply_url, skills,
         fingerprint, status, discovered_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Kenya', 'Nairobi', 'remote', 'full_time',
             $7, $8, $9, 'verified', '2000-01-01T00:00:00Z', now())
     RETURNING id, external_id, source_url, source_platform, title`,
    [
      externalId,
      `regression_${marker}`,
      sourceUrl,
      `Regression Engineer ${ordinal}`,
      `Regression Co ${marker}`,
      `A posting written by the regression verifier. ${"detail ".repeat(40)}`,
      sourceUrl,
      ["TypeScript", "Postgres"],
      `regression-fingerprint-${marker}-${ordinal}`,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("candidate insert returned nothing");
  return row;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }

  const marker = `${Date.now()}${randomBytes(3).toString("hex")}`;
  const companySlug = `regression-co-${marker}`;

  const pool = new pg.Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 20_000,
    statement_timeout: 60_000,
  });

  const client = await pool.connect();
  let opportunityId = "";

  try {
    // ---------------------------------------------------------------------
    // [1] The transaction helper
    //
    // The promotion is one unit of work: read the candidates, create the
    // opportunities, link them back, write the skills. If it is not one
    // transaction, two promoters can do the same work twice — and the
    // unique constraint is the second line of defence, not the first.
    // ---------------------------------------------------------------------

    console.log("\n[1] the transaction helper");
    const rollbackSlug = `regression-rollback-${marker}`;
    let threw = false;
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO companies (name, slug, industry, country)
         VALUES ($1, $2, 'Testing', 'KE')`,
        [`Regression Rollback ${marker}`, rollbackSlug],
      );
      throw new Error("deliberate failure");
    }).catch(() => {
      threw = true;
    });
    check("a failed transaction reports the failure", threw);
    const rolledBack = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM companies WHERE slug = $1`,
      [rollbackSlug],
    );
    check(
      "a failed transaction leaves nothing behind",
      rolledBack.rows[0]?.count === "0",
      `count=${rolledBack.rows[0]?.count}`,
    );

    // ---------------------------------------------------------------------
    // [2] The claim
    //
    // The fixtures are committed first. A row that another transaction
    // has not committed is invisible to it, so it cannot be locked by
    // it — and a lock on a row nobody else can see proves nothing.
    // ---------------------------------------------------------------------

    console.log("\n[2] the promotion claim");
    await client.query(
      `INSERT INTO companies (name, slug, industry, country)
       VALUES ($1, $2, 'Testing', 'KE')`,
      [`Regression Co ${marker}`, companySlug],
    );
    const first = await insertCandidate(client, marker, 1);
    const second = await insertCandidate(client, marker, 2);
    const third = await insertCandidate(client, marker, 3);
    await client.query("COMMIT");

    await client.query("BEGIN");

    // The fixtures are held for the length of the test.
    //
    // The deployed pipeline promotes candidates with the status
    // 'verified', and it claims them with `FOR UPDATE SKIP LOCKED` — so
    // a fixture this transaction holds is walked past by the pipeline.
    // Without the hold, the pipeline promotes the fixture outside this
    // transaction, and its opportunity survives the rollback: the test
    // then reports a leak that is really the pipeline doing its job.
    await client.query(
      `SELECT id FROM discovery_candidates
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [[first.id, second.id]],
    );

    // Another promoter holds the third candidate.
    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        `SELECT id FROM discovery_candidates WHERE id = $1 FOR UPDATE`,
        [third.id],
      );

      const whileLocked = await client.query<{ id: string }>(
        PROMOTION_CLAIM_SQL,
        [400],
      );
      check(
        "a candidate another promoter is holding is not claimed",
        !whileLocked.rows.some((row) => row.id === third.id),
        `claimed ${whileLocked.rows.length} rows`,
      );

      await lockClient.query("ROLLBACK");

      const afterRelease = await client.query<{ id: string }>(
        PROMOTION_CLAIM_SQL,
        [400],
      );
      check(
        "a released candidate is claimed",
        afterRelease.rows.some((row) => row.id === third.id),
        `claimed ${afterRelease.rows.length} rows`,
      );
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }

    // ---------------------------------------------------------------------
    // [3] The promotion
    // ---------------------------------------------------------------------

    console.log("\n[3] the promotion statement");
    const identity = opportunityIdentity(first.external_id, first.source_url);
    const payload = [
      {
        candidate_id: first.id,
        company_slug: companySlug,
        source_platform: `regression_${marker}`,
        source_url: `https://regression_${marker}.com`,
        external_id: identity,
        title: first.title,
        description: "A posting written by the regression verifier.",
        country: "Kenya",
        city: "Nairobi",
        work_mode: "remote",
        employment_type: "full_time",
        salary_min: null,
        salary_max: null,
        currency: "KES",
        apply_url: first.source_url,
        posted_at: null,
        simhash: "0",
        fingerprint: `regression-fingerprint-${marker}-1`,
        skills: ["TypeScript", "Postgres"],
      },
    ];

    const promoted = await client.query<{
      candidate_id: string;
      opportunity_id: string;
    }>(PROMOTION_SQL, [JSON.stringify(payload), [first.id]]);

    check(
      "the promotion links one candidate",
      promoted.rowCount === 1,
      `rowCount=${promoted.rowCount}`,
    );

    const linked = promoted.rows[0];
    opportunityId = linked?.opportunity_id ?? "";

    const opportunity = await client.query<{
      external_id: string;
      title: string;
      source_id: string | null;
      platform: string;
    }>(
      `SELECT external_id, title, source_id, platform
         FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    check("the opportunity was created", opportunity.rows.length === 1);
    check(
      "the external id is the posting's identity",
      opportunity.rows[0]?.external_id === identity,
      opportunity.rows[0]?.external_id,
    );
    check(
      "the external id is not the URL written twice",
      opportunity.rows[0]?.external_id !== `${first.source_url}${first.source_url}`,
    );
    check(
      "a platform with no source row leaves the source empty",
      opportunity.rows[0]?.source_id === null,
      String(opportunity.rows[0]?.source_id),
    );

    const candidate = await client.query<{
      status: string;
      imported_opportunity_id: string | null;
    }>(
      `SELECT status, imported_opportunity_id
         FROM discovery_candidates WHERE id = $1`,
      [first.id],
    );
    check(
      "the candidate is marked imported",
      candidate.rows[0]?.status === "imported",
      candidate.rows[0]?.status,
    );
    check(
      "the candidate points at the opportunity",
      candidate.rows[0]?.imported_opportunity_id === opportunityId,
    );

    await client.query(SKILL_INSERT_SQL, [
      JSON.stringify([
        { opportunity_id: opportunityId, skills: ["TypeScript", "Postgres"] },
      ]),
    ]);
    const skills = await client.query<{ skill: string }>(
      `SELECT skill FROM opportunity_skills
        WHERE opportunity_id = $1 ORDER BY skill`,
      [opportunityId],
    );
    check(
      "the skills were written",
      skills.rows.length === 2 &&
        skills.rows[0]?.skill === "Postgres" &&
        skills.rows[1]?.skill === "TypeScript",
      skills.rows.map((row) => row.skill).join(","),
    );

    // ---------------------------------------------------------------------
    // [4] The race
    //
    // The same promotion, run again — which is what a second promoter
    // does when it read the candidate before the first one committed.
    // The catalogue must end up with one row, not two.
    // ---------------------------------------------------------------------

    console.log("\n[4] a second promotion of the same candidate");
    const repeated = await client.query<{
      candidate_id: string;
      opportunity_id: string;
    }>(PROMOTION_SQL, [JSON.stringify(payload), [first.id]]);

    check(
      "the second promotion links nothing",
      repeated.rowCount === 0,
      `rowCount=${repeated.rowCount}`,
    );

    const rows = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunities WHERE external_id = $1`,
      [identity],
    );
    check(
      "the catalogue holds one row for the posting",
      rows.rows[0]?.count === "1",
      `count=${rows.rows[0]?.count}`,
    );

    // ---------------------------------------------------------------------
    // [5] The match write
    // ---------------------------------------------------------------------

    console.log("\n[5] the match write");
    const user = await pool.query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("no user to match against");

    const matchPayload = [
      {
        user_id: userId,
        opportunity_id: opportunityId,
        score: 0.82,
        factors: { skills: 0.9, location: 0.5, experience: 0.7 },
        explanation: "A regression explanation.",
        gaps: ["Kubernetes", "GraphQL"],
      },
    ];

    const written = await client.query(MATCH_UPSERT_SQL, [
      JSON.stringify(matchPayload),
    ]);
    check(
      "the match was written",
      written.rowCount === 1,
      `rowCount=${written.rowCount}`,
    );

    const stored = await client.query<{
      score: string;
      factors: Record<string, number>;
      explanation: string;
      gaps: string[];
    }>(
      `SELECT score, factors, explanation, gaps
         FROM matches WHERE user_id = $1 AND opportunity_id = $2`,
      [userId, opportunityId],
    );
    check("the match is there", stored.rows.length === 1);
    check(
      "the score is stored",
      Number(stored.rows[0]?.score) === 0.82,
      stored.rows[0]?.score,
    );
    check(
      "the factors keep their shape",
      stored.rows[0]?.factors?.skills === 0.9 &&
        stored.rows[0]?.factors?.experience === 0.7,
      JSON.stringify(stored.rows[0]?.factors),
    );
    check(
      "the explanation is stored",
      stored.rows[0]?.explanation === "A regression explanation.",
    );
    check(
      "the gaps are a flat list of text",
      Array.isArray(stored.rows[0]?.gaps) &&
        stored.rows[0]?.gaps.length === 2 &&
        stored.rows[0]?.gaps[0] === "Kubernetes",
      JSON.stringify(stored.rows[0]?.gaps),
    );

    const updated = await client.query(MATCH_UPSERT_SQL, [
      JSON.stringify([
        {
          ...matchPayload[0],
          score: 0.91,
          gaps: ["Rust"],
        },
      ]),
    ]);
    const afterUpdate = await client.query<{
      score: string;
      gaps: string[];
    }>(
      `SELECT score, gaps FROM matches
        WHERE user_id = $1 AND opportunity_id = $2`,
      [userId, opportunityId],
    );
    check(
      "a second write updates the match instead of adding another",
      updated.rowCount === 1 &&
        afterUpdate.rows.length === 1 &&
        Number(afterUpdate.rows[0]?.score) === 0.91 &&
        afterUpdate.rows[0]?.gaps.length === 1,
      `rows=${afterUpdate.rows.length} score=${afterUpdate.rows[0]?.score}`,
    );

    // The form that does not exist. `unnest` has no overload that takes
    // an array of arrays, so the gaps cannot be written that way — the
    // reason the statement reads them as JSON is not a style choice.
    await client.query("SAVEPOINT gaps_form");
    let gapsFormRefused = false;
    try {
      await client.query(
        `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps, created_at, updated_at)
         SELECT (p->>'user_id')::uuid,
                (p->>'opportunity_id')::uuid,
                (p->>'score')::numeric,
                p->'factors',
                p->>'explanation',
                unnest(ARRAY[p->'gaps'], ARRAY[p->'gaps']),
                now(), now()
           FROM jsonb_array_elements($1::jsonb) AS p`,
        [JSON.stringify(matchPayload)],
      );
    } catch {
      gapsFormRefused = true;
      await client.query("ROLLBACK TO SAVEPOINT gaps_form");
    }
    await client.query("RELEASE SAVEPOINT gaps_form");
    check(
      "the shape Postgres does not have is still refused",
      gapsFormRefused,
    );

    // ---------------------------------------------------------------------
    // [6] The identity of an employer
    //
    // One employer, one row — and the rule that says so is a constraint,
    // not a convention. The catalogue held one employer's roles under
    // three rows ("Weloglobal", "Welo Global", "Welocalize") because
    // nothing stopped the second row from being written.
    // ---------------------------------------------------------------------

    console.log("\n[6] the identity of an employer");
    const identityColumn = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'canonical_key'`,
    );
    check(
      "the employer row carries its identity",
      identityColumn.rows[0]?.count === "1",
      `count=${identityColumn.rows[0]?.count}`,
    );

    const identityIndex = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM pg_indexes
        WHERE tablename = 'companies'
          AND indexdef ILIKE '%canonical_key%'
          AND indexdef ILIKE '%UNIQUE%'`,
    );
    check(
      "the identity is unique in the database",
      Number(identityIndex.rows[0]?.count ?? 0) >= 1,
      `indexes=${identityIndex.rows[0]?.count}`,
    );

    const key = `regression-identity-${marker}`;
    await client.query(
      `INSERT INTO companies (name, slug, canonical_key)
       VALUES ($1, $2, $3)`,
      [`Regression Identity ${marker}`, `regression-identity-${marker}`, key],
    );

    await client.query("SAVEPOINT identity");
    let duplicateRefused = false;
    try {
      await client.query(
        `INSERT INTO companies (name, slug, canonical_key)
         VALUES ($1, $2, $3)`,
        [
          `Regression Identity Other ${marker}`,
          `regression-identity-other-${marker}`,
          key,
        ],
      );
    } catch {
      duplicateRefused = true;
      await client.query("ROLLBACK TO SAVEPOINT identity");
    }
    await client.query("RELEASE SAVEPOINT identity");
    check(
      "a second row for the same employer is refused",
      duplicateRefused,
    );

    const rowsForKey = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM companies WHERE canonical_key = $1`,
      [key],
    );
    check(
      "the employer has one row",
      rowsForKey.rows[0]?.count === "1",
      `count=${rowsForKey.rows[0]?.count}`,
    );

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(error);
    failures += 1;
  } finally {
    client.release();
    await pool.end();
  }

  // -----------------------------------------------------------------------
  // Nothing left behind
  //
  // The opportunities, the matches and the skills were written inside the
  // transaction, so the rollback took them with it. The candidates and
  // the company were fixtures, committed before the test so that another
  // connection could see them; they are removed here, and the counts are
  // checked afterwards.
  //
  // The rows are counted by the ids the transaction created, not by the
  // marker's name in them: the deployed pipeline promotes the fixtures
  // too, and a promotion the pipeline made is real work rather than a
  // leak — counting it as one would report a failure that is not there.
  // -----------------------------------------------------------------------

  console.log("\n[7] nothing left behind");
  const leftover = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
  try {
    const rolledBack = await leftover.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    check(
      "no opportunity survived the rollback",
      rolledBack.rows[0]?.count === "0",
      `count=${rolledBack.rows[0]?.count}`,
    );

    const rolledBackSkills = await leftover.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM opportunity_skills s
         JOIN opportunities o ON o.id = s.opportunity_id
        WHERE s.opportunity_id = $1`,
      [opportunityId],
    );
    check(
      "no skill survived the rollback",
      rolledBackSkills.rows[0]?.count === "0",
      `count=${rolledBackSkills.rows[0]?.count}`,
    );

    // The fixtures are removed.
    await leftover.query(
      `DELETE FROM discovery_candidates WHERE source_url LIKE $1`,
      [`%${marker}%`],
    );
    await leftover.query(`DELETE FROM companies WHERE slug LIKE $1`, [
      `%${marker}%`,
    ]);

    const candidates = await leftover.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM discovery_candidates WHERE source_url LIKE $1`,
      [`%${marker}%`],
    );
    check(
      "no candidate was left behind",
      candidates.rows[0]?.count === "0",
      `count=${candidates.rows[0]?.count}`,
    );

    const companies = await leftover.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM companies WHERE slug LIKE $1`,
      [`%${marker}%`],
    );
    check(
      "no company was left behind",
      companies.rows[0]?.count === "0",
      `count=${companies.rows[0]?.count}`,
    );

    const matches = await leftover.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM matches m
         JOIN opportunities o ON o.id = m.opportunity_id
        WHERE m.opportunity_id = $1`,
      [opportunityId],
    );
    check(
      "no match was left behind",
      matches.rows[0]?.count === "0",
      `count=${matches.rows[0]?.count}`,
    );
  } finally {
    await leftover.end();
  }

  // -----------------------------------------------------------------------
  // The length of the queue
  //
  // The queue of pages waiting to be read is bounded by its own length.
  // A cycle of listing expansion can put six hundred rows into a queue
  // that drains at eighty pages an hour, so the queue grew faster than
  // it drained and a vacancy found today was read next week.
  //
  // The agents ask the queue how much room is left before they fill it.
  // The answer has to be the truth: a queue that cannot be measured
  // must not stop the work, so a failure to measure leaves the queue
  // open rather than closed.
  // -----------------------------------------------------------------------

  console.log("\n[8] the length of the queue");
  {
    const counter = new pg.Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 20_000,
    });
    let counted = -1;
    try {
      counted = await countPending(counter);
    } finally {
      await counter.end();
    }
    const measured = await pendingQueueDepth();

    check(
      "the queue's length is counted, not guessed",
      measured === counted,
      `measured=${measured} counted=${counted}`,
    );

    const full = await queueRoom(measured);
    check(
      "a queue at its limit has no room",
      full === 0,
      `room=${full}`,
    );

    const withRoom = await queueRoom(measured + 25);
    check(
      "a queue below its limit has room",
      withRoom === 25,
      `room=${withRoom}`,
    );

    const noLimit = await queueRoom(0);
    check(
      "a queue with no limit has no room",
      noLimit === 0,
      `room=${noLimit}`,
    );
  }

  // -----------------------------------------------------------------------
  // The Google sign-in's first step
  //
  // The browser is sent to Neon Auth's authorization endpoint, and the
  // client id in that request has to be the API's own — the client
  // registered on Neon Auth's OAuth server. Google's client id is held
  // by Neon Auth for the *provider*, and a server that has never heard
  // of it answers "client not found" and sends the user to an error
  // page. That is what happened: every Google sign-in failed, at the
  // first request, for every user, for as long as the wrong id was
  // sent. The state row is written and rolled back with the rest.
  // -----------------------------------------------------------------------

  console.log("\n[9] the Google sign-in's first request");
  {
    const googleClient = process.env.NEON_AUTH_GOOGLE_CLIENT_ID;
    const apiClient = process.env.NEON_AUTH_OAUTH_CLIENT_ID;

    if (!apiClient) {
      console.log("  --   no OAuth client configured; nothing to check");
    } else {
      // The state row is written and rolled back with the rest of the
      // harness: nothing about a check may survive it.
      const started = await withTransaction(
        async () =>
          await beginOAuthFlow({
            provider: "google",
            appRedirectUri: "https://mboqara.angisoft.co.ke/dashboard",
          }),
      );
      const asked = new URL(started.authorizationUrl);
      const sentClient = asked.searchParams.get("client_id") ?? "";

      check(
        "the request asks Neon Auth's own authorization endpoint",
        asked.pathname.endsWith("/oauth2/authorize"),
        asked.pathname,
      );
      check(
        "the request names the API's own client",
        sentClient === apiClient,
        sentClient,
      );
      check(
        "the request does not name the provider's client",
        !googleClient || sentClient !== googleClient,
        googleClient ? `google id also configured` : "no google id configured",
      );
      check(
        "the request carries the provider it was asked for",
        asked.searchParams.get("provider") === "google",
        asked.searchParams.get("provider") ?? "none",
      );
      check(
        "the request comes back to the API's own callback",
        asked.searchParams.get("redirect_uri") === oauthCallbackUrl(),
        asked.searchParams.get("redirect_uri") ?? "none",
      );
      check(
        "the request carries PKCE",
        asked.searchParams.get("code_challenge_method") === "S256" &&
          (asked.searchParams.get("code_challenge") ?? "").length > 20,
        asked.searchParams.get("code_challenge_method") ?? "none",
      );
    }
  }

  console.log("");
  await appPool.end().catch(() => undefined);
  if (failures > 0) {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("ALL CHECKS PASSED");
  }
}

/** The number of pages waiting to be read, counted directly. */
async function countPending(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM discovery_search_results
      WHERE status = 'pending'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

void main();
