import { query } from "../../db/pool.js";
import { jobSourceAdapters } from "./index.js";
import { ingestSource, type IngestionStats } from "./pipeline.js";

export async function runIngestion(
  adapters = jobSourceAdapters,
): Promise<IngestionStats[]> {
  const results: IngestionStats[] = [];

  for (const adapter of adapters) {
    const stats = await ingestSource(adapter);
    results.push(stats);
    console.log(
      `[ingest] ${stats.source}: fetched=${stats.fetched} inserted=${stats.inserted} updated=${stats.updated} failed=${stats.failed}${stats.error ? ` error=${stats.error}` : ""}`,
    );
  }

  const expired = await query(
    `UPDATE opportunities
        SET status = 'expired'
      WHERE status = 'active'
        AND posted_at < now() - interval '60 days'`,
  );

  console.log(`[ingest] expired=${expired.rowCount ?? 0}`);
  return results;
}
