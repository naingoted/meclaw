import { beforeEach, describe, expect, it, vi } from "vitest";

import { retrieveKnowledge } from "./retrieve";

describe("retrieveKnowledge", () => {
  beforeEach(() => {
    delete process.env.RAG_TOP_K;
  });

  it("embeds the query, searches the vector store, and returns chunks plus compact sources", async () => {
    const embedder = {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    };
    const store = {
      ensureCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(async () => [
        {
          id: "projects/echo-clone.md:0",
          source: "projects/echo-clone.md",
          title: "Echo Clone",
          text: "Chunk A",
          ordinal: 0,
          score: 0.99,
        },
        {
          id: "projects/echo-clone.md:1",
          source: "projects/echo-clone.md",
          title: "Echo Clone",
          text: "Chunk B",
          ordinal: 1,
          score: 0.72,
        },
        {
          id: "resume.md:0",
          source: "resume.md",
          title: "Resume",
          text: "Chunk C",
          ordinal: 0,
          score: 0.88,
        },
      ]),
    };

    const result = await retrieveKnowledge("What is Thet's tech stack?", {
      embedder,
      store,
    });

    expect(embedder.embed).toHaveBeenCalledWith("What is Thet's tech stack?");
    expect(store.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], 4);
    expect(result).toEqual({
      mode: "rag",
      chunks: [
        {
          id: "projects/echo-clone.md:0",
          source: "projects/echo-clone.md",
          title: "Echo Clone",
          text: "Chunk A",
          ordinal: 0,
          score: 0.99,
        },
        {
          id: "projects/echo-clone.md:1",
          source: "projects/echo-clone.md",
          title: "Echo Clone",
          text: "Chunk B",
          ordinal: 1,
          score: 0.72,
        },
        {
          id: "resume.md:0",
          source: "resume.md",
          title: "Resume",
          text: "Chunk C",
          ordinal: 0,
          score: 0.88,
        },
      ],
      sources: [
        {
          title: "Echo Clone",
          source: "projects/echo-clone.md",
          score: 0.99,
        },
        {
          title: "Resume",
          source: "resume.md",
          score: 0.88,
        },
      ],
    });
  });

  it("honors the configured topK value", async () => {
    process.env.RAG_TOP_K = "7";

    const embedder = {
      embed: vi.fn(async () => [0.9]),
    };
    const store = {
      ensureCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(async () => []),
    };

    await retrieveKnowledge("query", {
      embedder,
      store,
    });

    expect(store.search).toHaveBeenCalledWith([0.9], 7);
  });

  it("returns fallback for blank queries without calling external services", async () => {
    const embedder = {
      embed: vi.fn(),
    };
    const store = {
      ensureCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(),
    };

    await expect(
      retrieveKnowledge("   ", {
        embedder,
        store,
      }),
    ).resolves.toEqual({
      mode: "fallback",
      chunks: [],
      sources: [],
    });

    expect(embedder.embed).not.toHaveBeenCalled();
    expect(store.search).not.toHaveBeenCalled();
  });

  it("returns fallback instead of throwing when embedding or search fails", async () => {
    const embeddingFailure = await retrieveKnowledge("query", {
      embedder: {
        embed: vi.fn(async () => {
          throw new Error("ollama offline");
        }),
      },
      store: {
        search: vi.fn(),
      },
    });

    const searchFailure = await retrieveKnowledge("query", {
      embedder: {
        embed: vi.fn(async () => [1, 2, 3]),
      },
      store: {
        search: vi.fn(async () => {
          throw new Error("qdrant offline");
        }),
      },
    });

    expect(embeddingFailure).toEqual({
      mode: "fallback",
      chunks: [],
      sources: [],
    });
    expect(searchFailure).toEqual({
      mode: "fallback",
      chunks: [],
      sources: [],
    });
  });

  it("logs retrieval failures in development before falling back", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await retrieveKnowledge("query", {
      embedder: {
        embed: vi.fn(async () => {
          throw new Error("ollama offline");
        }),
      },
      store: {
        search: vi.fn(),
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[rag] Retrieval failed; falling back to full corpus.",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
