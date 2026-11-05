/**
 * One employer, one row — and the text as it was meant to read.
 *
 * The catalogue grew from sources that never agreed on how to write an
 * employer or a title:
 *
 *   - the board's URL token ("weloglobal"),
 *   - the board's own page ("Welo Global"),
 *   - the posting's JSON-LD ("Welo Global"),
 *   - a model's guess ("Welocalize");
 *
 * and from a page that wrote its own markup as text:
 *
 *   - "Arabic Linguistic Evaluator & Functional Tester",
 *   - a description that held `<div class="…">`.
 *
 * The consequences are visible in the product: one employer's roles
 * under three rows, a job title under the name of an employer, and a
 * description that shows its own markup to the reader.
 *
 * What this repairs, in one transaction:
 *
 *   1. **The entities.** "&" is decoded — once, and in the order
 *      that leaves a double-escaped entity alone.
 *
 *   2. **The employer's name.** It is normalised the same way the
 *      application normalises it, and the canonical key of that name is
 *      stored on the row. The key is what says that "AnywhereNow" and
 *      "Anywhere Now" are one employer, and it is what the database
 *      refuses to let two rows share.
 *
 *   3. **The duplicates.** Two rows with the same key are one employer.
 *      The postings move to the survivor, the other row goes, and the
 *      candidates that named it are renamed to the survivor's name so
 *      the next promotion does not start the split again.
 *
 *   4. **The descriptions.** Escaped markup is decoded and turned back
 *      into text; plain text is only decoded.
 *
 * The dry run is the default. Nothing is written without `--apply`.
 *
 * Run: npx tsx scripts/repair-catalogue-identity.ts [--apply]
 */

import dns from "node:dns";
import pg from "pg";

import {
  canonicalCompanyKey,
  normaliseCompanyName,
} from "../services/api/src/services/engine/company.js";
import {
  decodeEntities,
  htmlToMarkdown,
} from "../services/api/src/services/engine/html.js";

// ---------------------------------------------------------------------------
// The database host resolves to IPv6 addresses that are not reachable from
// every network, and the client waits on them until it times out. The
// address family is forced to IPv4 for the length of the run.
// ---------------------------------------------------------------------------

const originalLookup = dns.lookup;
dns.lookup = function patchedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
): void {
  originalLookup.call(
    dns,
    hostname,
    { ...options, family: 4 },
    callback as (
      err: NodeJS.ErrnoException | null,
      address: string,
      family: number,
    ) => void,
  );
} as typeof dns.lookup;

const ENTITY_ARTIFACT =
  /&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);/;

/**
 * True when the text is markup rather than prose.
 *
 * A description that is already markdown must not be run through the
 * markdown converter — it would escape its own asterisks — so the
 * converter is only used when there is markup to convert.
 */
const HAS_MARKUP =
  /<\/?(div|p|span|ul|ol|li|h[1-6]|br|table|thead|tbody|tr|td|th|strong|em|b|i|u|a|section|article|figure|img|svg|iframe|video|button|label|form|input)\b[^>]*>/i;

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  roles: number;
}

interface CandidateCompany {
  company: string;
  rows: number;
}

/**
 * The cleanest form of a stored description.
 *
 * The entities are decoded, and markup that was written as text is
 * turned back into text. The result is capped the way the extractor
 * caps it, so a repaired description is the same shape as a fresh one.
 */
export function repairDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!ENTITY_ARTIFACT.test(value)) return value;

  const decoded = decodeEntities(value);
  const repaired = HAS_MARKUP.test(decoded)
    ? htmlToMarkdown(decoded, { onlyMainContent: false })
    : decoded;

  // The paragraph breaks are kept: a description is read in paragraphs,
  // and flattening it into one line makes it unreadable. The result is
  // capped the way the extractor caps it, so a repaired description is
  // the same shape as a fresh one.
  return repaired.replace(/\n{3,}/g, "\n\n").trim().slice(0, 12_000);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("No database URL in the environment");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    // ---------------------------------------------------------------------
    // 1. The employers
    // ---------------------------------------------------------------------
    const companies = await client.query<CompanyRow>(
      `SELECT c.id,
              c.name,
              c.slug,
              (SELECT count(*) FROM opportunities o WHERE o.company_id = c.id)::int AS roles
         FROM companies c`,
    );

    const survivorByKey = new Map<string, CompanyRow>();
    const losersByKey = new Map<string, CompanyRow[]>();

    for (const row of companies.rows) {
      const normalised = normaliseCompanyName(row.name);
      const key = canonicalCompanyKey(normalised ?? row.name);
      if (!key) continue;

      const known = survivorByKey.get(key);
      if (!known) {
        survivorByKey.set(key, row);
        continue;
      }

      // The survivor is the row whose name reads like words ("Welo
      // Global" over "Weloglobal"), and among those the one with the
      // most postings.
      const readsBetter = (candidate: CompanyRow, current: CompanyRow): boolean =>
        / /.test(candidate.name) && !/ /.test(current.name)
          ? true
          : / /.test(candidate.name) === / /.test(current.name)
            ? candidate.roles > current.roles
            : false;

      if (readsBetter(row, known)) {
        // The new row is the better name: it becomes the survivor and
        // the row it replaces becomes a loser.
        survivorByKey.set(key, row);
        losersByKey.set(key, [
          known,
          ...(losersByKey.get(key) ?? []),
        ]);
      } else {
        // The row that was there stays; the new one is the loser.
        losersByKey.set(key, [...(losersByKey.get(key) ?? []), row]);
      }
    }

    const mergedGroups = [...losersByKey.entries()].filter(
      ([, losers]) => losers.length > 0,
    );

    console.log(
      `employers: ${companies.rows.length}, distinct keys: ${survivorByKey.size}, groups to merge: ${mergedGroups.length}`,
    );

    for (const [key, losers] of mergedGroups) {
      const survivor = survivorByKey.get(key);
      if (!survivor) continue;
      console.log(
        `   merge ${key}: keep "${survivor.name}" (${survivor.roles} roles), drop ${losers
          .map((loser) => `"${loser.name}" (${loser.roles})`)
          .join(", ")}`,
      );

      if (!apply) continue;

      const loserIds = [
        ...new Set(
          losers
            .map((loser) => loser.id)
            .filter((id) => id !== survivor.id),
        ),
      ];
      if (loserIds.length === 0) continue;

      await client.query(
        `UPDATE opportunities SET company_id = $1, updated_at = now()
          WHERE company_id = ANY($2::uuid[])`,
        [survivor.id, loserIds],
      );
      await client.query(
        `UPDATE job_sources SET company_id = $1, updated_at = now()
          WHERE company_id = ANY($2::uuid[])`,
        [survivor.id, loserIds],
      );
      await client.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [
        loserIds,
      ]);
    }

    // The candidates that named a losing row are renamed to the
    // survivor's name. Otherwise the next promotion reads the old
    // spelling, finds no row for it and starts the split again.
    const candidateCompanies = await client.query<CandidateCompany>(
      `SELECT company, count(*)::int AS rows
         FROM discovery_candidates
        WHERE company IS NOT NULL AND company <> ''
        GROUP BY company`,
    );

    const nameToSurvivor = new Map<string, CompanyRow>();
    for (const row of companies.rows) {
      const key = canonicalCompanyKey(
        normaliseCompanyName(row.name) ?? row.name,
      );
      const survivor = survivorByKey.get(key);
      if (survivor) nameToSurvivor.set(row.name, survivor);
    }

    let renamedCandidates = 0;
    const candidateRenames: Array<[string, string]> = [];
    for (const row of candidateCompanies.rows) {
      const survivor = nameToSurvivor.get(row.company);
      if (!survivor || survivor.name === row.company) continue;
      renamedCandidates += row.rows;
      candidateRenames.push([survivor.name, row.company]);
    }
    if (apply) {
      for (const [name, from] of candidateRenames) {
        await client.query(
          `UPDATE discovery_candidates SET company = $1, updated_at = now()
            WHERE company = $2`,
          [name, from],
        );
      }
    }
    console.log(`candidate rows renamed to the surviving employer: ${renamedCandidates}`);

    // ---------------------------------------------------------------------
    // 2. The names and the keys
    // ---------------------------------------------------------------------
    let renamedEmployers = 0;
    const employerRows: Array<[string, string, string]> = [];
    for (const [key, survivor] of survivorByKey.entries()) {
      const normalised = normaliseCompanyName(survivor.name);
      const name = normalised ?? survivor.name;
      if (name !== survivor.name) renamedEmployers += 1;
      employerRows.push([name, key, survivor.id]);
    }
    if (apply) {
      // The rows are written in batches: one statement per employer
      // would be two thousand round trips to the database, and the
      // repair has to finish in minutes, not in half an hour.
      for (const batch of chunks(employerRows, 200)) {
        await client.query(
          `UPDATE companies c
              SET name = v.name, canonical_key = v.key, updated_at = now()
             FROM unnest($1::text[], $2::text[], $3::uuid[]) AS v(name, key, id)
            WHERE c.id = v.id`,
          [
            batch.map((row) => row[0]),
            batch.map((row) => row[1]),
            batch.map((row) => row[2]),
          ],
        );
      }
    }
    console.log(`employer rows renamed: ${renamedEmployers}`);

    // ---------------------------------------------------------------------
    // 3. The entities in the titles
    // ---------------------------------------------------------------------
    const entityRows = await client.query<{
      opportunities: number;
      candidates: number;
    }>(
      `SELECT (SELECT count(*) FROM opportunities
                WHERE title ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);')::int AS opportunities,
              (SELECT count(*) FROM discovery_candidates
                WHERE title ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);')::int AS candidates`,
    );
    console.log(
      `titles holding entities: opportunities ${entityRows.rows[0]?.opportunities ?? 0}, candidates ${entityRows.rows[0]?.candidates ?? 0}`,
    );

    if (apply) {
      await decodeTitles(client);
    }

    // ---------------------------------------------------------------------
    // 4. The descriptions
    // ---------------------------------------------------------------------
    const descriptions = await client.query<{
      id: string;
      description: string | null;
    }>(
      `SELECT id, description
         FROM opportunities
        WHERE description ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);'`,
    );

    let repairedDescriptions = 0;
    const descriptionUpdates: Array<[string, string]> = [];
    for (const row of descriptions.rows) {
      const repaired = repairDescription(row.description);
      if (!repaired || repaired === row.description) continue;
      repairedDescriptions += 1;
      if (repairedDescriptions <= 2) {
        console.log(`   before: ${row.description?.slice(0, 120)}`);
        console.log(`   after : ${repaired.slice(0, 120)}`);
      }
      descriptionUpdates.push([row.id, repaired]);
    }

    const candidateDescriptions = await client.query<{
      id: string;
      description: string | null;
    }>(
      `SELECT id, description
         FROM discovery_candidates
        WHERE description ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);'`,
    );

    let repairedCandidateDescriptions = 0;
    const candidateDescriptionUpdates: Array<[string, string]> = [];
    for (const row of candidateDescriptions.rows) {
      const repaired = repairDescription(row.description);
      if (!repaired || repaired === row.description) continue;
      repairedCandidateDescriptions += 1;
      candidateDescriptionUpdates.push([row.id, repaired]);
    }

    if (apply) {
      for (const batch of chunks(descriptionUpdates, 100)) {
        await client.query(
          `UPDATE opportunities o
              SET description = v.description, updated_at = now()
             FROM unnest($1::uuid[], $2::text[]) AS v(id, description)
            WHERE o.id = v.id`,
          [
            batch.map((row) => row[0]),
            batch.map((row) => row[1]),
          ],
        );
      }
      for (const batch of chunks(candidateDescriptionUpdates, 100)) {
        await client.query(
          `UPDATE discovery_candidates c
              SET description = v.description, updated_at = now()
             FROM unnest($1::uuid[], $2::text[]) AS v(id, description)
            WHERE c.id = v.id`,
          [
            batch.map((row) => row[0]),
            batch.map((row) => row[1]),
          ],
        );
      }
    }

    console.log(
      `descriptions repaired: opportunities ${repairedDescriptions}, candidates ${repairedCandidateDescriptions}`,
    );

    if (apply) {
      await client.query("COMMIT");
      console.log("\ncommitted");
    } else {
      await client.query("ROLLBACK");
      console.log("\ndry run — nothing was written. Pass --apply to write it.");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Decodes the entities in the stored titles.
 *
 * The application's own decoder is used, so the text is repaired
 * exactly the way a fresh extraction repairs it — once, and in the
 * order that leaves a double-escaped entity alone.
 */
async function decodeTitles(client: pg.Client): Promise<void> {
  const opportunities = await client.query<{ id: string; title: string }>(
    `SELECT id, title FROM opportunities
      WHERE title ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);'`,
  );
  for (const batch of chunks(
    opportunities.rows.map((row) => [row.id, decodeEntities(row.title)] as [
      string,
      string,
    ]),
    200,
  )) {
    await client.query(
      `UPDATE opportunities o
          SET title = v.title, updated_at = now()
         FROM unnest($1::uuid[], $2::text[]) AS v(id, title)
        WHERE o.id = v.id`,
      [batch.map((row) => row[0]), batch.map((row) => row[1])],
    );
  }

  const candidates = await client.query<{ id: string; title: string }>(
    `SELECT id, title FROM discovery_candidates
      WHERE title ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);'`,
  );
  for (const batch of chunks(
    candidates.rows.map((row) => [row.id, decodeEntities(row.title)] as [
      string,
      string,
    ]),
    200,
  )) {
    await client.query(
      `UPDATE discovery_candidates c
          SET title = v.title, updated_at = now()
         FROM unnest($1::uuid[], $2::text[]) AS v(id, title)
        WHERE c.id = v.id`,
      [batch.map((row) => row[0]), batch.map((row) => row[1])],
    );
  }
}

/**
 * Splits a list into batches.
 *
 * The repair writes thousands of rows, and one statement per row is
 * one round trip per row — the difference between minutes and half an
 * hour.
 */
function chunks<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

// The script is also imported by the checks, so it only runs when it is
// the program that was asked for.
const isMain =
  process.argv[1]?.endsWith("repair-catalogue-identity.ts") ?? false;

if (isMain) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
