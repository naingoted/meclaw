import postgres from "postgres";

import type { RagChunk, RagSearchResult, VectorStoreClient } from "./types";

type Sql = ReturnType<typeof postgres>;

type PgVectorStoreOptions = {
  url?: string;
  sql?: Sql; // injectable for tests / connection reuse
};

const DEFAULT_URL = "postgres://meclaw:meclaw@localhost:5432/meclaw";

/** Postgres vector literal, e.g. [0.1,0.2,...]. Cast to ::vector in SQL. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * pgvector-backed VectorStoreClient. Replaces QdrantClient with no interface
 * change, so lib/rag/ingest.ts is untouched. The rag_chunks table + the vector
 * extension are owned by Drizzle migrations (drizzle/, `pnpm db:migrate`).
 */
export class PgVectorStore implements VectorStoreClient {
  private readonly sql: Sql;

  constructor(options: PgVectorStoreOptions = {}) {
    this.sql = options.sql ?? postgres(options.url ?? DEFAULT_URL, { max: 4 });
  }

  // No-op: the schema is migration-owned (see lib/db/migrate.ts).
  async ensureCollection(): Promise<void> {}

  async upsert(points: Array<RagChunk & { embedding: number[] }>): Promise<void> {
    if (points.length === 0) return;
    await this.sql.begin(async (sql) => {
      for (const p of points) {
        const vec = toVectorLiteral(p.embedding);
        await sql`
          INSERT INTO rag_chunks (id, source, title, text, ordinal, embedding)
          VALUES (${p.id}, ${p.source}, ${p.title}, ${p.text}, ${p.ordinal}, ${vec}::vector)
          ON CONFLICT (id) DO UPDATE SET
            source = EXCLUDED.source,
            title = EXCLUDED.title,
            text = EXCLUDED.text,
            ordinal = EXCLUDED.ordinal,
            embedding = EXCLUDED.embedding
        `;
      }
    });
  }

  async deleteBySource(source: string): Promise<void> {
    await this.sql`DELETE FROM rag_chunks WHERE source = ${source}`;
  }

  async search(vector: number[], limit: number): Promise<RagSearchResult[]> {
    const vec = toVectorLiteral(vector);
    const rows = await this.sql<
      {
        id: string;
        source: string;
        title: string;
        text: string;
        ordinal: number;
        score: number;
      }[]
    >`
      SELECT id, source, title, text, ordinal,
             1 - (embedding <=> ${vec}::vector) AS score
      FROM rag_chunks
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      text: r.text,
      ordinal: r.ordinal,
      score: Number(r.score),
    }));
  }
}
