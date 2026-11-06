/**
 * One-off: name the employers whose rows are named after a tenant.
 *
 * A board's address is not an employer's name. When the board's page
 * could not be read — and it cannot be read sometimes — the postings
 * were written under the tenant's address, prettified:
 * "Erey.Fa.Em3.Oraclecloud.Com" is Airtel Africa, and
 * "Fa Evlj Saasfaprod1.Fa.Ocs.Oraclecloud.Com" is IOM.
 *
 * The board is found again from the candidates' own addresses, the
 * board's page is asked for the employer's name, and the rows are
 * renamed — and merged into the employer's own row when the catalogue
 * already has one.
 *
 * Run: npx tsx scripts/repair-board-employers.ts [--apply]
 */

import dns from "node:dns";
import pg from "pg";

import { boardEmployer, detectAts } from "../services/api/src/services/engine/discover.js";
import { canonicalCompanyKey, companySlug } from "../services/api/src/services/engine/company.js";

// The database host resolves to IPv6 addresses that are not reachable
// from every network. The address family is forced to IPv4 for the
// length of the run.
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
 * True when a name is a tenant's address rather than an employer's name.
 *
 * No employer is called "…Oraclecloud.Com", and the address is the
 * whole of the name: a real name has spaces where the address has
 * dots, and the address's parts are the vendor's own.
 */
function looksLikeTenantAddress(name: string): boolean {
  return /(?:oraclecloud|myworkdayjobs)\.com$/i.test(name.trim());
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
    const companies = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM companies
        WHERE name ~* '(oraclecloud|myworkdayjobs)\\.com$'`,
    );

    console.log(`tenant-address employer rows: ${companies.rows.length}`);

    for (const company of companies.rows) {
      // The board is found from the candidates' own addresses: the
      // posting's address names the tenant and the site.
      const candidates = await client.query<{ source_url: string }>(
        `SELECT source_url FROM discovery_candidates
          WHERE company = $1
          LIMIT 50`,
        [company.name],
      );

      const boards = new Map<string, { kind: string; token: string }>();
      for (const row of candidates.rows) {
        const board = detectAts(row.source_url);
        if (!board) continue;
        boards.set(`${board.kind}:${board.token}`, board);
      }

      if (boards.size === 0) {
        console.log(`  ${company.name}: no board found in its candidates`);
        continue;
      }

      for (const board of boards.values()) {
        const employer = await boardEmployer(board as never).catch(() => null);

        if (!employer) {
          console.log(
            `  ${company.name}: ${board.kind}:${board.token} -> no name on its page`,
          );
          continue;
        }

        const key = canonicalCompanyKey(employer);
        const slug = companySlug(employer);
        console.log(
          `  ${company.name} -> ${employer} (${board.kind}:${board.token}) key=${key} slug=${slug}`,
        );

        if (!apply) continue;

        // The employer's own row, if the catalogue has one.
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM companies WHERE canonical_key = $1 AND id <> $2 LIMIT 1`,
          [key, company.id],
        );
        const survivor = existing.rows[0]?.id ?? company.id;

        if (survivor !== company.id) {
          // The roles and the candidates move to the employer's row.
          await client.query(
            `UPDATE opportunities SET company_id = $1, updated_at = now()
              WHERE company_id = $2`,
            [survivor, company.id],
          );
          await client.query(
            `UPDATE discovery_candidates SET company = $1, updated_at = now()
              WHERE company = $2`,
            [employer, company.name],
          );
          await client.query(`DELETE FROM companies WHERE id = $1`, [company.id]);
          await client.query(
            `UPDATE companies SET name = $1, canonical_key = $2, slug = $3,
                    updated_at = now()
              WHERE id = $4`,
            [employer, key, slug, survivor],
          );
        } else {
          await client.query(
            `UPDATE companies SET name = $1, canonical_key = $2, slug = $3,
                    updated_at = now()
              WHERE id = $4`,
            [employer, key, slug, company.id],
          );
          await client.query(
            `UPDATE discovery_candidates SET company = $1, updated_at = now()
              WHERE company = $2`,
            [employer, company.name],
          );
        }
      }
    }

    console.log(
      apply ? "\nwritten" : "\ndry run — nothing was written. Pass --apply to write it.",
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
