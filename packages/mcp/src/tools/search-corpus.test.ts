import { describe, expect, it } from "vitest";
import { searchCorpus } from "./search-corpus";
import type { EmbeddingClient, VectorStoreClient } from "@meclaw/rag";

const embedder: EmbeddingClient = { embed: async () => [0.1, 0.2, 0.3] };
const store = {
  ensureCollection: async () => {},
  upsert: async () => {},
  deleteBySource: async () => {},
  search: async (_vec: number[], limit: number) =>
    [
      { id: "about:0", source: "about.md", title: "About", text: "hi", ordinal: 0, score: 0.62 },
      { id: "resume:3", source: "resume.md", title: "Resume", text: "x", ordinal: 3, score: 0.31 },
    ].slice(0, limit),
} satisfies VectorStoreClient;

describe("searchCorpus", () => {
  it("embeds the query and returns scored chunks (default topK)", async () => {
    const out = await searchCorpus({ query: "what is your stack?" }, { embedder, store });
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ id: "about:0", source: "about.md", score: 0.62 });
  });

  it("respects topK", async () => {
    const out = await searchCorpus({ query: "q", topK: 1 }, { embedder, store });
    expect(out.length).toBe(1);
  });
});
