import { describe, expect, it, vi } from "vitest";

import type { KnowledgeDoc } from "@/lib/content";

import { ingestKnowledge } from "./ingest";

describe("ingestKnowledge", () => {
  it("loads docs, chunks them, embeds each chunk, and upserts the enriched chunks", async () => {
    const docs: KnowledgeDoc[] = [
      {
        slug: "projects/echo-clone.md",
        title: "Echo Clone",
        body: "# Echo Clone\nA local-first AI twin.",
      },
    ];
    const chunks = [
      {
        id: "projects/echo-clone.md:0",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "Chunk A",
        ordinal: 0,
      },
      {
        id: "projects/echo-clone.md:1",
        source: "projects/echo-clone.md",
        title: "Echo Clone",
        text: "Chunk B",
        ordinal: 1,
      },
    ];
    const loadDocs = vi.fn(async () => docs);
    const chunker = vi.fn(() => chunks);
    const embedder = {
      embed: vi
        .fn()
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockResolvedValueOnce([0.4, 0.5, 0.6]),
    };
    const store = {
      ensureCollection: vi.fn(async () => undefined),
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
    vi.doMock("@/lib/rag/ingest", () => ({
      ingestKnowledge: vi.fn(async () => ({ docs: 3, chunks: 9 })),
    }));

    const { runIngestCli } = await import("@/scripts/ingest");

    process.exitCode = undefined;
    await runIngestCli();

    expect(logSpy).toHaveBeenCalledWith("Ingested 3 docs into 9 chunks.");
    expect(process.exitCode).toBeUndefined();

    vi.resetModules();
    vi.doMock("@/lib/rag/ingest", () => ({
      ingestKnowledge: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));

    const { runIngestCli: runIngestCliWithFailure } = await import("@/scripts/ingest");

    process.exitCode = undefined;
    await runIngestCliWithFailure();

    expect(errorSpy).toHaveBeenCalledWith("Knowledge ingestion failed.");
    expect(process.exitCode).toBe(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });
});
