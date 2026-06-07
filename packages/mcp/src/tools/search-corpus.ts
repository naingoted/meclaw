import type { EmbeddingClient, RagSearchResult, VectorStoreClient } from "@meclaw/rag";
import { z } from "zod";

export const searchCorpusInput = z.object({
  query: z.string().min(1).describe("Natural-language query to search the knowledge corpus"),
  topK: z.number().int().min(1).max(20).default(5).describe("Number of chunks to return"),
});

export type SearchCorpusArgs = { query: string; topK?: number };

export interface CorpusDeps {
  embedder: EmbeddingClient;
  store: VectorStoreClient;
}

/** Semantic kNN over rag_chunks. Reuses @meclaw/rag embed + pgvector search. */
export async function searchCorpus(
  args: SearchCorpusArgs,
  deps: CorpusDeps,
): Promise<RagSearchResult[]> {
  const topK = args.topK ?? 5;
  const vector = await deps.embedder.embed(args.query);
  return deps.store.search(vector, topK);
}
