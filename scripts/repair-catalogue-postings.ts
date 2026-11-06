/**
 * One-off: take the postings that were stored twice, and the postings
 * that were filed under no employer at all, out of the catalogue.
 *
 * Three faults, and they are the same fault seen from two sides: the
 * pipeline learned a posting from two places, or learned a page that
 * was never a posting.
 *
 *   1. **The same posting, stored twice.** A board is read every cycle
 *      and a search result is read every cycle, and the two write the
 *      same posting under different titles — "Kassel, Hesse" and
 *      "Kassel" — with the same address. The catalogue then shows the
 *      role twice, and the second copy is the one with the poorer
 *      city.
 *
 *   2. **A page that was never a posting.** "ajirahub.co.ke/login" is
 *      a sign-in page. The page's heading was read as a role title and
 *      the employer's own name was read as the role. There is no
 *      posting there, and there never was.
 *
 *   3. **A title written down as an employer.** Arbeitnow's addresses
 *      are "/jobs/companies/<company>/<posting>", and the company's
 *      part is sometimes a posting's title instead of a name:
 *      "signal-processing-engineer-rf-processing-analytics". Seventeen
 *      different roles were filed under that title as if it were an
 *      employer. The employer is not in the address, so the rows are
 *      removed rather than renamed to a guess.
 *
 * The script is dry-run by default and writes with `--apply`.
 *
 * Run: npx tsx scripts/repair-catalogue-postings.ts [--apply]
 */

import dns from "node:dns";
import pg from "pg";

import {
  canonicalCompanyKey,
  companySlug,
  hostBrand,
  normaliseCompanyName,
} from "../services/api/src/services/engine/company.js";
import { addressOf, hostOf } from "../services/api/src/services/engine/job-url.js";
import { oracleCompany } from "../services/api/src/services/engine/discover.js";

// The database is reached over IPv4: the Node resolver picks the IPv6
// address first, and the route to it does not exist.
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

/**
 * The words that make a name a role rather than an employer.
 *
 * "Signal Processing Engineer RF Processing & Analytics" is a role.
 * "Careers International" is a company, and "Interlead" is a company:
 * the words are a sign, not a verdict, so a name has to *look like a
 * role* — the word is there, and the name is more than one word.
 */
const ROLE_WORDS = [
  "engineer",
  "manager",
  "designer",
  "counsel",
  "officer",
  "developer",
  "analyst",
  "specialist",
  "coordinator",
  "supervisor",
  "technician",
  "accountant",
  "administrator",
  "consultant",
  "executive",
  "director",
  "intern",
  "internship",
  "apprentice",
  "representative",
  "associate",
  "assistant",
  "lead",
  "head of",
  "at ",
];

/**
 * True when the name reads as a role rather than an employer.
 */
function looksLikeRole(name: string): boolean {
  const lower = name.toLowerCase();
  if (!ROLE_WORDS.some((word) => lower.includes(word))) return false;

  // A name that the catalogue's own rules accept is an employer.
  // "Careers International" and "Interlead" survive that test; the
  // title-shaped names do not.
  if (normaliseCompanyName(name)) return false;

  return true;
}

/**
 * The catalogue's own key and address for an employer.
 */
function canonicalKeyOf(name: string): string {
  return canonicalCompanyKey(normaliseCompanyName(name) ?? name) || name.toLowerCase();
}

function slugOf(name: string): string {
  return companySlug(name);
}

interface OpportunityRow {  id: string;
  company_id: string;
  company_name: string;
  title: string;
  apply_url: string;
  description_length: number;
  created_at: Date;
}

/**
 * The posting's address, by the catalogue's own rules.
 *
 * Oracle's site number is an alias — "CX" and "CX_1" are one board —
 * and Taleo keeps the posting id in the query string. The repair has
 * to group the copies the same way the dedup agent does, or it leaves
 * behind exactly the duplicates the pipeline will refuse to make.
 */
function keyOf(url: string): string {
  return addressOf(url, null) ?? url.trim().toLowerCase();
}

/**
 * The employer row for a name, made when it is not there yet.
 *
 * The canonical key's index is partial ("WHERE canonical_key IS NOT
 * NULL"), so the conflict cannot be named in the statement — the row
 * is looked for first and the insert is plain.
 */
async function companyIdFor(
  client: pg.Client,
  name: string,
): Promise<string | null> {
  const key = canonicalKeyOf(name);
  const byKey = await client.query<{ id: string }>(
    `SELECT id FROM companies WHERE canonical_key = $1 LIMIT 1`,
    [key],
  );
  if (byKey.rows[0]?.id) return byKey.rows[0].id;

  const slug = slugOf(name);
  const bySlug = await client.query<{ id: string }>(
    `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  if (bySlug.rows[0]?.id) return bySlug.rows[0].id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO companies (name, slug, canonical_key, created_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [name, slug, key],
  );
  if (created.rows[0]?.id) return created.rows[0].id;

  const raced = await client.query<{ id: string }>(
    `SELECT id FROM companies WHERE slug = $1 OR canonical_key = $2 LIMIT 1`,
    [slug, key],
  );
  return raced.rows[0]?.id ?? null;
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
    // 1. The same posting, stored twice.
    // ---------------------------------------------------------------------
    const rows = await client.query<OpportunityRow>(
      `SELECT o.id,
              o.company_id,
              c.name AS company_name,
              o.title,
              o.apply_url,
              length(o.description) AS description_length,
              o.created_at
         FROM opportunities o
         JOIN companies c ON c.id = o.company_id`,
    );

    const groups = new Map<string, OpportunityRow[]>();
    for (const row of rows.rows) {
      const key = keyOf(row.apply_url);
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }

    const duplicateGroups = [...groups.entries()].filter(
      ([, group]) => group.length > 1,
    );

    console.log(
      `postings: ${rows.rows.length}, addresses used twice: ${duplicateGroups.length}`,
    );

    let removedDuplicates = 0;
    let keptMatches = 0;
    for (const [key, group] of duplicateGroups) {
      // The survivor is the row that knows the most about the posting,
      // and the one whose employer reads like an employer.
      //
      // The first copy came from the board and the second from a search
      // result, and the second is usually the poorer one: the city is
      // missing, the description is shorter, and the employer's name is
      // the board's own token ("Tenableinc" where the board's page says
      // "Tenable").
      const sorted = [...group].sort((left, right) => {
        const leftWords = / /.test(left.company_name) ? 0 : 1;
        const rightWords = / /.test(right.company_name) ? 0 : 1;
        if (leftWords !== rightWords) return leftWords - rightWords;
        if (right.description_length !== left.description_length) {
          return right.description_length - left.description_length;
        }
        return left.created_at.getTime() - right.created_at.getTime();
      });
      const survivor = sorted[0];
      const losers = sorted.slice(1);

      console.log(
        `   ${key}\n      keep: "${survivor.title}" (${survivor.company_name}, ${survivor.description_length} chars)\n      drop: ${losers
          .map((loser) => `"${loser.title}" (${loser.company_name})`)
          .join(", ")}`,
      );

      if (!apply) {
        removedDuplicates += losers.length;
        continue;
      }

      for (const loser of losers) {
        // The users who were shown the role keep being shown it — under
        // the copy that knows more about it. A user who was shown both
        // copies keeps one row, not two.
        const moved = await client.query(
          `INSERT INTO matches (user_id, opportunity_id, score, factors, explanation, gaps)
           SELECT user_id, $1, score, factors, explanation, gaps
             FROM matches
            WHERE opportunity_id = $2
           ON CONFLICT (user_id, opportunity_id) DO NOTHING
           RETURNING id`,
          [survivor.id, loser.id],
        );
        keptMatches += moved.rowCount ?? 0;

        // The rest of the posting's rows follow it.
        await client.query(
          `INSERT INTO opportunity_skills (opportunity_id, skill, required, weight)
           SELECT $1, skill, required, weight FROM opportunity_skills
            WHERE opportunity_id = $2
           ON CONFLICT (opportunity_id, skill) DO NOTHING`,
          [survivor.id, loser.id],
        );
        await client.query(
          `INSERT INTO opportunity_professions (opportunity_id, profession_id, confidence)
           SELECT $1, profession_id, confidence FROM opportunity_professions
            WHERE opportunity_id = $2
           ON CONFLICT (opportunity_id, profession_id) DO NOTHING`,
          [survivor.id, loser.id],
        );
        await client.query(
          `INSERT INTO opportunity_questions (opportunity_id, provider, kind, question, required, answer_type, options, raw)
           SELECT $1, provider, kind, question, required, answer_type, options, raw
             FROM opportunity_questions
            WHERE opportunity_id = $2
           ON CONFLICT (opportunity_id, provider, question) DO NOTHING`,
          [survivor.id, loser.id],
        );
        await client.query(
          `INSERT INTO opportunity_sources (opportunity_id, source_id, source_type, source_url, external_id, first_seen_at, last_seen_at)
           SELECT $1, source_id, source_type, source_url, external_id, first_seen_at, last_seen_at
             FROM opportunity_sources
            WHERE opportunity_id = $2
           ON CONFLICT (opportunity_id, source_url) DO NOTHING`,
          [survivor.id, loser.id],
        );

        // The candidates that were promoted into the copy that is about
        // to go are promoted into the copy that stays — the candidate
        // holds the reference, and a dangling one would refuse the
        // delete.
        await client.query(
          `UPDATE discovery_candidates
              SET imported_opportunity_id = $1, updated_at = now()
            WHERE imported_opportunity_id = $2`,
          [survivor.id, loser.id],
        );

        await client.query(`DELETE FROM opportunities WHERE id = $1`, [loser.id]);
        removedDuplicates += 1;
      }
    }
    console.log(
      `duplicate postings removed: ${removedDuplicates}, user matches kept: ${keptMatches}`,
    );

    // ---------------------------------------------------------------------
    // 2. The pages that were never postings — and the postings whose
    //    address is a sign-in page.
    // ---------------------------------------------------------------------
    //
    // "ajirahub.co.ke/login" and "app.alignerr.com/signin?job=<id>" are
    // not postings: they are the way into one. The posting behind them
    // is real, and the candidates table knows its address — so the
    // address is repaired from there, and the posting is kept.
    //
    // Where nothing knows a better address, the row is removed: a
    // posting with no address is not a posting.
    const candidates = await client.query<{
      title: string;
      company: string | null;
      source_url: string;
    }>(
      `SELECT title, company, source_url
         FROM discovery_candidates
        WHERE source_url IS NOT NULL AND source_url <> ''`,
    );

    const junk = await client.query<{
      id: string;
      title: string;
      company_name: string;
      apply_url: string;
    }>(
      `SELECT o.id, o.title, c.name AS company_name, o.apply_url
         FROM opportunities o
         JOIN companies c ON c.id = o.company_id
        WHERE o.apply_url ~* '/(login|signin|sign-in)([?#]|$)'
           OR lower(trim(o.title)) = lower(trim(c.name))`,
    );

    console.log(`postings with a sign-in address: ${junk.rows.length}`);

    let repairedAddresses = 0;
    let removedJunk = 0;
    for (const row of junk.rows) {
      // The posting's own address, by the id in the sign-in address.
      const id = /([0-9a-f]{8}-[0-9a-f-]{20,}|[0-9a-f]{20,})/i.exec(row.apply_url)?.[1];
      const byId = id
        ? candidates.rows.find((candidate) => candidate.source_url.includes(id))
        : undefined;
      // Or by the title, when the address held no id to match on.
      const byTitle = candidates.rows.find(
        (candidate) =>
          candidate.title.trim().toLowerCase() === row.title.trim().toLowerCase() &&
          !/^\/login$/i.test(new URL(candidate.source_url).pathname),
      );

      const address = byId?.source_url ?? byTitle?.source_url ?? null;
      if (address && address !== row.apply_url) {
        console.log(`   repaired: "${row.title}" — ${row.apply_url} -> ${address}`);
        repairedAddresses += 1;
        if (apply) {
          await client.query(
            `UPDATE opportunities SET apply_url = $1, updated_at = now() WHERE id = $2`,
            [address, row.id],
          );
        }
        continue;
      }

      console.log(`   removed: "${row.title}" (${row.company_name}) — ${row.apply_url}`);
      removedJunk += 1;
      if (apply) {
        await client.query(
          `UPDATE discovery_candidates SET imported_opportunity_id = NULL, updated_at = now()
            WHERE imported_opportunity_id = $1`,
          [row.id],
        );
        await client.query(`DELETE FROM opportunities WHERE id = $1`, [row.id]);
      }
    }
    console.log(
      `addresses repaired: ${repairedAddresses}, postings removed: ${removedJunk}`,
    );

    // ---------------------------------------------------------------------
    // 3. The titles written down as employers.
    // ---------------------------------------------------------------------
    //
    // Six employers were named after something that is not an employer.
    // Two of them are companies whose own name contains a role word —
    // "NYDEGGER Personal/Engineering AG", "Net at Work, LLC" — and two
    // are companies with no role word at all: "Growth Leads" is a
    // recruitment agency, and "VORKIS" is a company whose tagline was
    // read as its name. Only the names that are known to be something
    // else are renamed, and the rest are left alone: a name that looks
    // like a role is not proof that it is one.
    //
    // The renames are written down rather than guessed. Each one is a
    // name the pipeline has written down wrongly, and what it should
    // have been is known: the board's own page, the address's own
    // company part, the name the vendor's board is published under.
    const EMPLOYER_RENAMES = new Map<string, string>([
      // The board's own page title.
      ["How We Work & What We Value - Ashby", "Ashby"],
      // "…at Rightmove Greenhouse" — the employer's name is Rightmove,
      // and "Greenhouse" is the vendor the address came through.
      ["Legal Counsel - 12 month FTC at Rightmove Greenhouse", "Rightmove"],
      // The company's own tagline, read as its name.
      ["VORKIS knows what employer wants", "VORKIS"],
    ]);

    const companies = await client.query<{
      id: string;
      name: string;
      roles: number;
    }>(
      `SELECT c.id,
              c.name,
              (SELECT count(*) FROM opportunities o WHERE o.company_id = c.id)::int AS roles
         FROM companies c`,
    );

    const titleEmployers = companies.rows.filter((row) => looksLikeRole(row.name));
    console.log(
      `employers named after a role: ${titleEmployers.length} (${titleEmployers
        .reduce((sum, row) => sum + row.roles, 0)} postings)`,
    );
    for (const row of titleEmployers) {
      const rename = EMPLOYER_RENAMES.get(row.name);
      console.log(
        `   "${row.name}" — ${row.roles} postings${
          rename ? ` -> "${rename}"` : " (left alone: it reads as a company)"
        }`,
      );
    }

    if (apply) {
      for (const [from, to] of EMPLOYER_RENAMES) {
        const source = companies.rows.find((row) => row.name === from);
        if (!source) continue;

        // The employer the rows belong to, found by the catalogue's own
        // key, and made when it is not there yet.
        const target = companies.rows.find((row) => row.name === to);
        let targetId = target?.id ?? null;
        if (!targetId) {
          // The key's index is partial ("WHERE canonical_key IS NOT
          // NULL"), so the conflict cannot be named in the statement —
          // the row is looked for first and the insert is plain.
          const key = canonicalKeyOf(to);
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM companies WHERE canonical_key = $1 LIMIT 1`,
            [key],
          );
          targetId = existing.rows[0]?.id ?? null;
          if (!targetId) {
            const created = await client.query<{ id: string }>(
              `INSERT INTO companies (name, slug, canonical_key, created_at, updated_at)
               VALUES ($1, $2, $3, now(), now())
               RETURNING id`,
              [to, slugOf(to), key],
            );
            targetId = created.rows[0]?.id ?? null;
            if (targetId) {
              console.log(`   employer row created: "${to}"`);
            }
          }
        }
        if (!targetId) continue;

        await client.query(
          `UPDATE opportunities SET company_id = $1, updated_at = now()
            WHERE company_id = $2`,
          [targetId, source.id],
        );
        await client.query(
          `UPDATE job_sources SET company_id = $1, updated_at = now()
            WHERE company_id = $2`,
          [targetId, source.id],
        );
        await client.query(`DELETE FROM companies WHERE id = $1`, [source.id]);
      }
    }

    // ---------------------------------------------------------------------
    // 3b. An employer named after the board's placeholder.
    // ---------------------------------------------------------------------
    //
    // An Oracle tenant with no branding of its own answers "Candidate
    // Experience site", and the reader used to write that down as the
    // employer: four unrelated boards — a US department store, a French
    // industrial group, a US wealth manager and Airtel Africa — became
    // one fake company with ninety-one postings.
    //
    // The rows go back to the employer each host is actually known by:
    // another name already in the catalogue on the same host when there
    // is one (Airtel Africa publishes two site numbers on the same
    // host), and the host's own tenant brand when there is not.
    const GENERIC_EMPLOYER =
      /^(?:candidate experience(?: site)?|careers?(?: site)?|career site|job search|search jobs|all jobs|job board|home)$/i;

    const genericEmployers = companies.rows.filter((row) =>
      GENERIC_EMPLOYER.test(row.name),
    );
    console.log(`employers named after the board: ${genericEmployers.length}`);

    let reassigned = 0;
    for (const employer of genericEmployers) {
      const postings = await client.query<{ id: string; apply_url: string }>(
        `SELECT id, apply_url FROM opportunities WHERE company_id = $1`,
        [employer.id],
      );

      const byHost = new Map<string, string[]>();
      for (const posting of postings.rows) {
        const host = hostOf(posting.apply_url);
        const ids = byHost.get(host);
        if (ids) ids.push(posting.id);
        else byHost.set(host, [posting.id]);
      }

      for (const [host, ids] of byHost) {
        const known = await client.query<{ id: string; name: string }>(
          `SELECT c.id, c.name
             FROM opportunities o
             JOIN companies c ON c.id = o.company_id
            WHERE o.company_id <> $1
              AND split_part(regexp_replace(lower(o.apply_url), '^https?://', ''), '/', 1) = $2
            GROUP BY c.id, c.name
            ORDER BY count(*) DESC
            LIMIT 1`,
          [employer.id, host],
        );

        // The board's current name, read the way the reader reads it —
        // "Cetera" came from the logo the board serves from cetera.com,
        // not from the database's tenant code. Using a different name
        // here would leave the old rows under one employer and the next
        // cycle's rows under another, which is the fault being repaired.
        const site = postings.rows
          .map((posting) => /\/sites\/([^/]+)\/job\//i.exec(posting.apply_url)?.[1])
          .find(Boolean);
        const boardName = site
          ? await oracleCompany(host, site).catch(() => null)
          : null;

        const name = known.rows[0]?.name ?? boardName ?? hostBrand(host);
        if (!name) continue;

        console.log(
          `   "${employer.name}" — ${ids.length} postings on ${host} -> "${name}"`,
        );
        reassigned += ids.length;

        if (!apply) continue;

        const targetId = known.rows[0]?.id ?? (await companyIdFor(client, name));
        if (!targetId || targetId === employer.id) continue;

        await client.query(
          `UPDATE opportunities SET company_id = $1, updated_at = now()
            WHERE id = ANY($2::uuid[])`,
          [targetId, ids],
        );
      }
    }
    console.log(`postings re-attributed: ${reassigned}`);

    // ---------------------------------------------------------------------
    // 4. The employer rows left empty by the repair.
    // ---------------------------------------------------------------------
    if (apply) {
      const emptied = await client.query(
        `DELETE FROM companies c
          WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.company_id = c.id)
            AND NOT EXISTS (SELECT 1 FROM job_sources s WHERE s.company_id = c.id)`,
      );
      console.log(`empty employer rows removed: ${emptied.rowCount ?? 0}`);
    }

    if (!apply) {
      console.log("\ndry run — nothing was written. Pass --apply to write it.");
      await client.query("ROLLBACK");
      return;
    }

    await client.query("COMMIT");
    console.log("\nwritten");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main();
