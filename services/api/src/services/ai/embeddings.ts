import { aiEmbedWithProvider, getAiProvider } from "./client.js";
import { query } from "../../db/pool.js";
import { storeOpportunityEmbedding } from "./semantic-search.js";

interface OpportunityRow {
  id: string;
  title: string;
  description: string;
  city: string;
  country: string;
  work_mode: string;
  seniority: string;
  company_name: string;
  skills: string[];
}

const BATCH_SIZE = 25;

function buildText(row: OpportunityRow): string {
  return [
    `${row.title} at ${row.company_name}`,
    `${row.city}, ${row.country} (${row.work_mode})`,
    `Skills: ${row.skills.join(", ") || "not specified"}`,
    row.description,
  ].join(", ");
}

export interface EmbeddingRunResult {
  embedded: number;
  considered: number;
  skipped: boolean;
}

/**
 * Regenerates vector embeddings for active opportunities that do not yet have
 * a current embedding. Runs inside the API process (or the scaled worker role)
 * so no separate service has to be deployed.
 */
export async function refreshOpportunityEmbeddings(
  limit = Number(process.env.EMBED_LIMIT ?? 500),
): Promise<EmbeddingRunResult> {
  const provider = getAiProvider();
  if (!provider) {
    return { embedded: 0, considered: 0, skipped: true };
  }

  const result = await query<OpportunityRow>(
    `SELECT o.id, o.title, o.description, o.city, o.country, o.work_mode,
            o.seniority, c.name AS company_name,
            COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
       FROM opportunities o
       JOIN companies c ON c.id = o.company_id
       LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
      WHERE o.status = 'active' AND o.embedding IS NULL
      GROUP BY o.id, c.id
      ORDER BY o.posted_at DESC
      LIMIT $1`,
    [limit],
  );

  const rows = result.rows;
  let embedded = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { provider: batchProvider, vectors } = await aiEmbedWithProvider(
      batch.map((row) => buildText(row)),
      "passage",
    );

    for (const [offset, row] of batch.entries()) {
      const embedding = vectors[offset];
      if (!embedding) continue;
      await storeOpportunityEmbedding(
        row.id,
        embedding,
        batchProvider.embeddingModel,
      );
      embedded += 1;
    }
  }

  return { embedded, considered: rows.length, skipped: false };
}
