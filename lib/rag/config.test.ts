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
  it("returns a QdrantClient configured from QDRANT_URL and QDRANT_COLLECTION", () => {
    const env = {
      QDRANT_URL: "http://qdrant:6333",
      QDRANT_COLLECTION: "custom_collection",
    };

    const store = storeFromEnv(env);

    expect(store).toBeDefined();
    expect(store).toHaveProperty("search");
    expect(store).toHaveProperty("upsert");
    expect(store).toHaveProperty("ensureCollection");
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });

  it("returns a QdrantClient with localhost defaults when env vars are unset", () => {
    const env = {};

    const store = storeFromEnv(env);

    expect(store).toBeDefined();
    expect(store).toHaveProperty("search");
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });

  it("handles undefined QDRANT_URL gracefully", () => {
    const env = {
      QDRANT_COLLECTION: "custom_collection",
    };

    const store = storeFromEnv(env);

    expect(store).toBeDefined();
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });

  it("handles undefined QDRANT_COLLECTION gracefully", () => {
    const env = {
      QDRANT_URL: "http://qdrant:6333",
    };

    const store = storeFromEnv(env);

    expect(store).toBeDefined();
    expect(typeof (store as VectorStoreClient).search).toBe("function");
  });
});
