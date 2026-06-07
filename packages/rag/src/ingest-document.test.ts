import { describe, expect, it, vi } from "vitest";
import { ingestDocument, ingesterFor } from "./ingest-document";
import type { EmbeddingClient, VectorStoreClient } from "./types";

describe("ingestDocument", () => {
  it("deletes the doc's old chunks by source then upserts embedded new ones", async () => {
    const calls: string[] = [];
    const store = {
      ensureCollection: vi.fn(async () => {
        calls.push("ensure");
      }),
      deleteBySource: vi.fn(async () => {
        calls.push("delete");
      }),
      upsert: vi.fn(async (pts: { source: string }[]) => {
        calls.push("upsert");
        expect(pts[0].source).toBe("document:d1");
      }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    const result = await ingestDocument(
      { id: "d1", title: "Resume", body: "# Resume\n\nSome content about Thet.", origin: "manual" },
      { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
    );
    expect(calls).toEqual(["ensure", "delete", "upsert"]); // order matters: replace, not append
    expect(result.chunks).toBeGreaterThan(0);
  });

  it("gap origin: prepends '# {title}' so the question is embedded", async () => {
    let captured: { text: string }[] = [];
    const store = {
      ensureCollection: vi.fn(async () => {}),
      deleteBySource: vi.fn(async () => {}),
      upsert: vi.fn(async (pts: { text: string }[]) => {
        captured = pts;
      }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    await ingestDocument(
      { id: "g1", title: "When is his birthday?", body: "March 14, 1990.", origin: "gap" },
      { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
    );
    expect(captured[0].text.startsWith("# When is his birthday?")).toBe(true);
  });

  it("manual origin: chunks the body unchanged (no prepend)", async () => {
    let captured: { text: string }[] = [];
    const store = {
      ensureCollection: vi.fn(async () => {}),
      deleteBySource: vi.fn(async () => {}),
      upsert: vi.fn(async (pts: { text: string }[]) => {
        captured = pts;
      }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    await ingestDocument(
      { id: "m1", title: "Resume", body: "plain body text", origin: "manual" },
      { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
    );
    expect(captured[0].text).toBe("plain body text");
  });

  it("seed origin: behaves like manual (no prepend)", async () => {
    let captured: { text: string }[] = [];
    const store = {
      ensureCollection: vi.fn(async () => {}),
      deleteBySource: vi.fn(async () => {}),
      upsert: vi.fn(async (pts: { text: string }[]) => {
        captured = pts;
      }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    await ingestDocument(
      { id: "s1", title: "Imported", body: "seeded body", origin: "seed" },
      { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
    );
    expect(captured[0].text).toBe("seeded body");
  });

  it("gap origin is idempotent: re-ingest yields exactly one heading", async () => {
    let captured: { text: string }[] = [];
    const store = {
      ensureCollection: vi.fn(async () => {}),
      deleteBySource: vi.fn(async () => {}),
      upsert: vi.fn(async (pts: { text: string }[]) => {
        captured = pts;
      }),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    const doc = { id: "g2", title: "Fav language?", body: "TypeScript.", origin: "gap" as const };
    const opts = {
      store: store as unknown as VectorStoreClient,
      embedder,
      chunkSize: 1200,
      overlap: 180,
    };
    await ingestDocument(doc, opts);
    await ingestDocument(doc, opts);
    expect((captured[0].text.match(/# Fav language\?/g) ?? []).length).toBe(1);
  });

  it("gap origin with empty title does not throw", async () => {
    const store = {
      ensureCollection: vi.fn(async () => {}),
      deleteBySource: vi.fn(async () => {}),
      upsert: vi.fn(async () => {}),
      search: vi.fn(),
    };
    const embedder: EmbeddingClient = { embed: vi.fn(async () => [0.1, 0.2]) };
    await expect(
      ingestDocument(
        { id: "g3", title: "", body: "answer body", origin: "gap" },
        { store: store as unknown as VectorStoreClient, embedder, chunkSize: 1200, overlap: 180 },
      ),
    ).resolves.toBeDefined();
  });

  it("ingesterFor resolves the markdown ingester and rejects unknown kinds", () => {
    expect(ingesterFor("markdown")).toBeDefined();
    expect(() => ingesterFor("image")).toThrow(); // future kinds register their own ingester
  });
});
