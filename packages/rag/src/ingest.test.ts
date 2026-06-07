import type { KnowledgeDoc } from "@meclaw/core/content";
import { describe, expect, it, vi } from "vitest";

import { ingestKnowledge } from "./ingest";
import type { VectorStoreClient } from "./types";

describe("ingestKnowledge", () => {
  it("loads docs, chunks them, embeds each chunk, and upserts the enriched chunks", async () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "projects/meclaw.md",
        title: "Meclaw",
        body: "# Meclaw\nA local-first personal bot.",
      },
    ];
    const chunks = [
      {
        id: "projects/meclaw.md:0",
        source: "projects/meclaw.md",
        title: "Meclaw",
        text: "Chunk A",
        ordinal: 0,
      },
      {
        id: "projects/meclaw.md:1",
        source: "projects/meclaw.md",
        title: "Meclaw",
        text: "Chunk B",
        ordinal: 1,
      },
    ];
    const loadDocs = vi.fn(async () => docs);
    const chunker = vi.fn(() => chunks);
    const embedder = {
      embed: vi.fn().mockResolvedValueOnce([0.1, 0.2, 0.3]).mockResolvedValueOnce([0.4, 0.5, 0.6]),
    };
    const store = {
      ensureCollection: vi.fn(async () => undefined),
      deleteBySource: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      search: vi.fn(),
    };

    const result = await ingestKnowledge({
      loadDocs,
      chunker,
      embedder,
      store,
      chunkSize: 1200,
      overlap: 180,
    });

    expect(loadDocs).toHaveBeenCalledTimes(1);
    expect(chunker).toHaveBeenCalledWith(docs, {
      chunkSize: 1200,
      overlap: 180,
    });
    expect(store.ensureCollection).toHaveBeenCalledTimes(1);
    expect(embedder.embed).toHaveBeenNthCalledWith(1, "Chunk A");
    expect(embedder.embed).toHaveBeenNthCalledWith(2, "Chunk B");
    expect(store.upsert).toHaveBeenCalledWith([
      {
        ...chunks[0],
        embedding: [0.1, 0.2, 0.3],
      },
      {
        ...chunks[1],
        embedding: [0.4, 0.5, 0.6],
      },
    ]);
    expect(result).toEqual({
      docs: 1,
      chunks: 2,
    });
  });

  it("uses injected docs instead of loading from disk", async () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "persona.md",
        title: "Persona",
        body: "Owner profile",
      },
    ];
    const loadDocs = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const chunker = vi.fn(() => []);
    const embedder = { embed: vi.fn() };
    const store = {
      ensureCollection: vi.fn(async () => undefined),
      deleteBySource: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      search: vi.fn(),
    };

    const result = await ingestKnowledge({
      docs,
      loadDocs,
      chunker,
      embedder,
      store,
    });

    expect(loadDocs).not.toHaveBeenCalled();
    expect(chunker).toHaveBeenCalledWith(docs, {
      chunkSize: 1200,
      overlap: 180,
    });
    expect(store.upsert).toHaveBeenCalledWith([]);
    expect(result).toEqual({
      docs: 1,
      chunks: 0,
    });
  });

  it("bounds embedding concurrency for larger corpora", async () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "bulk.md",
        title: "Bulk",
        body: "Large corpus",
      },
    ];
    const chunks = Array.from({ length: 8 }, (_, index) => ({
      id: `bulk.md:${index}`,
      source: "bulk.md",
      title: "Bulk",
      text: `Chunk ${index}`,
      ordinal: index,
    }));
    let activeEmbeds = 0;
    let maxActiveEmbeds = 0;
    const embedder = {
      embed: vi.fn(async (text: string) => {
        activeEmbeds += 1;
        maxActiveEmbeds = Math.max(maxActiveEmbeds, activeEmbeds);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeEmbeds -= 1;
        return [Number(text.replace("Chunk ", ""))];
      }),
    };
    const store = {
      ensureCollection: vi.fn(async () => undefined),
      deleteBySource: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      search: vi.fn(),
    };

    await ingestKnowledge({
      docs,
      chunker: vi.fn(() => chunks),
      embedder,
      store,
      embedConcurrency: 2,
    });

    expect(embedder.embed).toHaveBeenCalledTimes(8);
    expect(maxActiveEmbeds).toBeLessThanOrEqual(2);
    expect(store.upsert).toHaveBeenCalledWith(
      chunks.map((chunk, index) => ({
        ...chunk,
        embedding: [index],
      })),
    );
  });

  it("cli prints counts on success and sets exitCode on real errors", async () => {
    const originalExitCode = process.exitCode;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.resetModules();
    vi.doMock("./ingest", () => ({
      ingestKnowledge: vi.fn(async () => ({ docs: 3, chunks: 9 })),
    }));

    const { runIngestCli } = await import("../scripts/ingest");

    process.exitCode = undefined;
    await runIngestCli();

    expect(logSpy).toHaveBeenCalledWith("Ingested 3 docs into 9 chunks.");
    expect(process.exitCode).toBeUndefined();

    vi.resetModules();
    vi.doMock("./ingest", () => ({
      ingestKnowledge: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));

    const { runIngestCli: runIngestCliWithFailure } = await import("../scripts/ingest");

    process.exitCode = undefined;
    await runIngestCliWithFailure();

    expect(errorSpy).toHaveBeenCalledWith("Knowledge ingestion failed.", expect.any(Error));
    expect(process.exitCode).toBe(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });
});

describe("ingestKnowledge delete-before-upsert", () => {
  it("deletes each source's points before upserting", async () => {
    const docs: KnowledgeDoc[] = [
      { slug: "persona.md", title: "Persona", body: "Thet is an engineer." },
      { slug: "resume.pdf", title: "Resume", body: "Worked at ShopBack." },
    ];

    const calls: string[] = [];
    const store: VectorStoreClient = {
      ensureCollection: vi.fn(async () => {
        calls.push("ensure");
      }),
      deleteBySource: vi.fn(async (source: string) => {
        calls.push(`delete:${source}`);
      }),
      upsert: vi.fn(async () => {
        calls.push("upsert");
      }),
      search: vi.fn(async () => []),
    };
    const embedder = { embed: vi.fn(async () => [0.1, 0.2, 0.3]) };

    await ingestKnowledge({ docs, store, embedder, chunkSize: 1200, overlap: 180 });

    const upsertIdx = calls.indexOf("upsert");
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(calls.filter((c) => c.startsWith("delete:"))).toEqual([
      "delete:persona.md",
      "delete:resume.pdf",
    ]);
    for (const [i, c] of calls.entries()) {
      if (c.startsWith("delete:")) expect(i).toBeLessThan(upsertIdx);
    }
  });
});
