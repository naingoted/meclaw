import { describe, it, expect, vi } from "vitest";
import { ingestDocument, ingesterFor } from "./ingest-document";
import type { VectorStoreClient, EmbeddingClient } from "./types";

describe("ingestDocument", () => {
  it("deletes the doc's old chunks by source then upserts embedded new ones", async () => {
    const calls: string[] = [];
    const store = {
      ensureCollection: vi.fn(async () => { calls.push("ensure"); }),
      deleteBySource: vi.fn(async () => { calls.push("delete"); }),
      upsert: vi.fn(async (pts: { source: string }[]) => { calls.push("upsert"); expect(pts[0].source).toBe("document:d1"); }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    const result = await ingestDocument(
      { id: "d1", title: "Resume", body: "# Resume\n\nSome content about Thet." },
      { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
    );
    expect(calls).toEqual(["ensure", "delete", "upsert"]); // order matters: replace, not append
    expect(result.chunks).toBeGreaterThan(0);
  });

  it("ingesterFor resolves the markdown ingester and rejects unknown kinds", () => {
    expect(ingesterFor("markdown")).toBeDefined();
    expect(() => ingesterFor("image")).toThrow(); // future kinds register their own ingester
  });
});
