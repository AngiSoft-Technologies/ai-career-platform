import { getAiProvider, aiEmbedWithProvider } from "../services/ai/client.js";
import { query } from "./pool.js";
import { storeOpportunityEmbedding } from "../services/ai/semantic-search.js";

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
  ].join("\n");
}

async function main(): Promise<void> {
  const provider = getAiProvider();
  if (!provider) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const limit = Number(process.env.EMBED_LIMIT ?? 500);
  const result = await query<OpportunityRow>(
    `SELECT o.id, o.title, o.description, o.city, o.country, o.work_mode,
            o.seniority, c.name AS company_name,
            COALESCE(array_agg(os.skill ORDER BY os.skill) FILTER (WHERE os.skill IS NOT NULL), '{}') AS skills
       FROM opportunities o
       JOIN companies c ON c.id = o.company_id
       LEFT JOIN opportunity_skills os ON os.opportunity_id = o.id
      WHERE o.status = 'active'
      GROUP BY o.id, c.id
      ORDER BY o.posted_at DESC
      LIMIT $1`,
    [limit],
  );

  console.log(
    `embedding ${result.rows.length} opportunities with ${provider.name}/${provider.embeddingModel}`,
  );

  let embedded = 0;
  for (let index = 0; index < result.rows.length; index += BATCH_SIZE) {
    const batch = result.rows.slice(index, index + BATCH_SIZE);
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

    console.log(`embedded ${embedded}/${result.rows.length}`);
  }

  console.log(`done: ${embedded} opportunities embedded`);
  await query("select 1");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
