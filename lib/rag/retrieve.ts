import { embedderFromEnv, storeFromEnv } from "./config";
import type { EmbeddingClient, RagSearchResult, RagSource, VectorStoreClient } from "./types";

const DEFAULT_TOP_K = 4;

export type RetrieveKnowledgeResult =
  | {
      mode: "fallback";
      chunks: [];
      sources: [];
    }
  | {
      mode: "rag";
      chunks: RagSearchResult[];
      sources: Array<RagSource & { score?: number }>;
    };

export type RetrieveKnowledgeOptions = {
  embedder?: EmbeddingClient;
  store?: Pick<VectorStoreClient, "search">;
  topK?: number;
};

function resolveTopK(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  const envValue = Number(process.env.RAG_TOP_K);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }

  return DEFAULT_TOP_K;
}

function buildSources(chunks: RagSearchResult[]): Array<RagSource & { score?: number }> {
  const bySource = new Map<string, RagSource & { score?: number }>();

  for (const chunk of chunks) {
    const existing = bySource.get(chunk.source);

    if (!existing || (chunk.score ?? 0) > (existing.score ?? 0)) {
      bySource.set(chunk.source, {
        title: chunk.title,
        source: chunk.source,
        score: chunk.score,
      });
    }
  }

  return [...bySource.values()];
}

export async function retrieveKnowledge(
  query: string,
  options: RetrieveKnowledgeOptions = {},
): Promise<RetrieveKnowledgeResult> {
  if (!query.trim()) {
    return {
      mode: "fallback",
      chunks: [],
      sources: [],
    };
  }

  const embedder = options.embedder ?? embedderFromEnv();
  const store = options.store ?? storeFromEnv();
  const topK = resolveTopK(options.topK);

  try {
    const vector = await embedder.embed(query);
    const chunks = await store.search(vector, topK);

    return {
      mode: "rag",
      chunks,
      sources: buildSources(chunks),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[rag] Retrieval failed; falling back to full corpus.", error);
    }

    return {
      mode: "fallback",
      chunks: [],
      sources: [],
    };
  }
}
