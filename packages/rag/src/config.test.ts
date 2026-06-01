import { describe, expect, it } from "vitest";

import { embedderFromEnv, storeFromEnv } from "./config";
import type { EmbeddingClient, VectorStoreClient } from "./types";

describe("embedderFromEnv", () => {
  it("returns an OllamaEmbedder configured from OLLAMA_BASE_URL and OLLAMA_EMBED_MODEL", () => {
    const env = {
      OLLAMA_BASE_URL: "http://ollama:11434",
      OLLAMA_EMBED_MODEL: "custom-embed",
    };

    const embedder = embedderFromEnv(env);

    expect(embedder).toBeDefined();
    expect(embedder).toHaveProperty("embed");
    expect(typeof (embedder as EmbeddingClient).embed).toBe("function");
  });

  it("returns an OllamaEmbedder with localhost defaults when env vars are unset", () => {
    const env = {};

    const embedder = embedderFromEnv(env);

    expect(embedder).toBeDefined();
    expect(embedder).toHaveProperty("embed");
    expect(typeof (embedder as EmbeddingClient).embed).toBe("function");
  });

  it("handles undefined OLLAMA_BASE_URL gracefully", () => {
    const env = {
      OLLAMA_EMBED_MODEL: "custom-embed",
    };

    const embedder = embedderFromEnv(env);

    expect(embedder).toBeDefined();
    expect(typeof (embedder as EmbeddingClient).embed).toBe("function");
  });

  it("handles undefined OLLAMA_EMBED_MODEL gracefully", () => {
    const env = {
      OLLAMA_BASE_URL: "http://ollama:11434",
    };

    const embedder = embedderFromEnv(env);

    expect(embedder).toBeDefined();
    expect(typeof (embedder as EmbeddingClient).embed).toBe("function");
  });
});

describe("storeFromEnv", () => {
  it("returns a PgVectorStore configured from DATABASE_URL", () => {
    const store = storeFromEnv({
      DATABASE_URL: "postgres://meclaw:meclaw@postgres:5432/meclaw",
    });
    expect(store).toBeDefined();
    expect(store).toHaveProperty("search");
    expect(store).toHaveProperty("upsert");
    expect(store).toHaveProperty("ensureCollection");
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });

  it("returns a PgVectorStore with the localhost default when DATABASE_URL is unset", () => {
    const store = storeFromEnv({});
    expect(store).toBeDefined();
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });
});
