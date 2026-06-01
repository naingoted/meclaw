import { describe, expect, it } from "vitest";

import { PgVectorStore } from "./pgvector";
import type { VectorStoreClient } from "./types";

describe("PgVectorStore (offline)", () => {
  it("implements the VectorStoreClient surface", () => {
    const store = new PgVectorStore({ url: "postgres://meclaw:meclaw@localhost:5432/meclaw" });
    const api = store as VectorStoreClient;
    expect(typeof api.ensureCollection).toBe("function");
    expect(typeof api.upsert).toBe("function");
    expect(typeof api.search).toBe("function");
    expect(typeof api.deleteBySource).toBe("function");
  });

  it("ensureCollection is a no-op (table is migration-owned, no DB call)", async () => {
    // postgres-js connects lazily, so this resolves without a live DB.
    const store = new PgVectorStore({ url: "postgres://meclaw:meclaw@localhost:5432/meclaw" });
    await expect(store.ensureCollection()).resolves.toBeUndefined();
  });
});

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("PgVectorStore (integration, real Postgres)", () => {
  it("upserts chunks then returns them ordered by cosine similarity", async () => {
    const postgres = (await import("postgres")).default;
    const { runMigrations } = await import("@meclaw/core/db/migrate");
    await runMigrations(DATABASE_URL);

    const sql = postgres(DATABASE_URL!, { max: 1 });
    const store = new PgVectorStore({ sql });
    try {
      await sql`TRUNCATE rag_chunks`;

      // Two orthogonal-ish 768-dim vectors; query aligns with the first.
      const a = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
      const b = Array.from({ length: 768 }, (_, i) => (i === 1 ? 1 : 0));

      await store.upsert([
        { id: "about:0", source: "about.md", title: "About", text: "Aaa", ordinal: 0, embedding: a },
        { id: "about:1", source: "about.md", title: "About", text: "Bbb", ordinal: 1, embedding: b },
      ]);

      const hits = await store.search(a, 2);
      expect(hits).toHaveLength(2);
      expect(hits[0].id).toBe("about:0"); // closest to query a
      expect(hits[0].score).toBeGreaterThan(hits[1].score);

      await store.deleteBySource("about.md");
      const after = await store.search(a, 2);
      expect(after).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});
