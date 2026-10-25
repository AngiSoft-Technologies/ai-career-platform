import { query } from "../../db/pool.js";
import { aiEmbedWithProvider, getAiProviders } from "./client.js";

export interface SemanticHit {
  id: string;
  similarity: number;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function embedQuery(text: string): Promise<{
  embedding: number[];
  model: string;
}> {
  const { provider, vectors } = await aiEmbedWithProvider([text], "query");
  const embedding = vectors[0];
  if (!embedding) throw new Error("AI_EMPTY_EMBEDDINGS");
  return { embedding, model: provider.embeddingModel };
}

export async function semanticHits(
  text: string,
  options: { limit?: number; country?: string } = {},
): Promise<SemanticHit[]> {
  if (getAiProviders().length === 0) return [];

  const { embedding, model } = await embedQuery(text);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const values: unknown[] = [toVectorLiteral(embedding), model];
  const clauses = [
    "o.status = 'active'",
    "o.embedding IS NOT NULL",
    `o.embedding_model = $${values.length}`,
  ];

  if (options.country) {
    values.push(options.country);
    clauses.push(`o.country ILIKE $${values.length}`);
  }

  values.push(limit);

  const result = await query<{ id: string; similarity: number }>(
    `SELECT o.id, 1 - (o.embedding <=> $1::vector) AS similarity
       FROM opportunities o
      WHERE ${clauses.join(" AND ")}
      ORDER BY o.embedding <=> $1::vector
      LIMIT $${values.length}`,
    values,
  );

  return result.rows.map((row) => ({
    id: row.id,
    similarity: Number(row.similarity),
  }));
}

export async function storeOpportunityEmbedding(
  opportunityId: string,
  embedding: number[],
  model: string,
): Promise<void> {
  await query(
    `UPDATE opportunities
        SET embedding = $2::vector,
            embedding_model = $3
      WHERE id = $1`,
    [opportunityId, toVectorLiteral(embedding), model],
  );
}

export async function storeProfileEmbedding(
  userId: string,
  embedding: number[],
  model: string,
): Promise<void> {
  await query(
    `UPDATE candidate_profiles
        SET embedding = $2::vector,
            embedding_model = $3
      WHERE user_id = $1`,
    [userId, toVectorLiteral(embedding), model],
  );
}
