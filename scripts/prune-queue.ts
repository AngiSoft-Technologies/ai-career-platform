/**
 * One-off: take the addresses that are known not to be postings out of
 * the queue.
 *
 * The queue holds what search engines and careers pages put in it, and
 * some of it is not a posting: a help page, an examination board's
 * news page, a social network's sign-in wall. Each of them is a
 * request the browse agent spends to be refused.
 *
 * The same rule that refuses them now — `engine/job-url.ts` — refuses
 * them here.
 *
 * Run: npx tsx scripts/prune-queue.ts [--apply]
 */

import dns from "node:dns";
import pg from "pg";

import { jobUrlRefusal } from "../services/api/src/services/engine/job-url.js";

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
    const rows = await client.query<{ id: string; source_url: string }>(
      `SELECT id, source_url
         FROM discovery_search_results
        WHERE status = 'pending'
        LIMIT 20000`,
    );

    const refused = new Map<string, number>();
    let count = 0;

    for (const row of rows.rows) {
      const reason = jobUrlRefusal(row.source_url);
      if (!reason) continue;
      count += 1;
      refused.set(reason, (refused.get(reason) ?? 0) + 1);
      if (apply) {
        await client.query(
          `UPDATE discovery_search_results
              SET status = 'failed', processed_at = now(), error = $2
            WHERE id = $1`,
          [row.id, reason],
        );
      }
    }

    console.log(`pending rows examined: ${rows.rows.length}`);
    console.log(`refused: ${count}`);
    for (const [reason, number] of refused) {
      console.log(`   ${reason}: ${number}`);
    }

    if (apply) {
      console.log("\nwritten");
    } else {
      console.log("\ndry run — nothing was written. Pass --apply to write it.");
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
