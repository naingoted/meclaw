import { OllamaEmbedder } from "./embed";
import { PgVectorStore } from "./pgvector";
import type { EmbeddingClient, VectorStoreClient } from "./types";

// Accepts process.env or any partial env map (tests pass literals), so callers
// don't need an unsafe cast to the full NodeJS.ProcessEnv shape.
type EnvMap = Record<string, string | undefined>;

// Build RAG clients from environment so the same code points at localhost in
// dev and at the compose service name (postgres) in the container deploy.
export function embedderFromEnv(env: EnvMap = process.env): EmbeddingClient {
  return new OllamaEmbedder({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_EMBED_MODEL,
  });
}

export function storeFromEnv(env: EnvMap = process.env): VectorStoreClient {
  return new PgVectorStore({ url: env.DATABASE_URL });
}
