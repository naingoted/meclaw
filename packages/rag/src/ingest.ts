import type { KnowledgeDoc } from "@meclaw/core/content";

import { loadIngestDocs } from "./loaders";
import { chunkKnowledgeDocs } from "./chunk";
import { OllamaEmbedder } from "./embed";
import { PgVectorStore } from "./pgvector";
import type { EmbeddingClient, RagChunk, VectorStoreClient } from "./types";

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 180;
const DEFAULT_EMBED_CONCURRENCY = 4;

type Chunker = (docs: KnowledgeDoc[], options: { chunkSize: number; overlap: number }) => RagChunk[];

type LoadDocs = () => KnowledgeDoc[] | Promise<KnowledgeDoc[]>;

export type IngestKnowledgeOptions = {
  docs?: KnowledgeDoc[];
  loadDocs?: LoadDocs;
  chunker?: Chunker;
  embedder?: EmbeddingClient;
  store?: VectorStoreClient;
  chunkSize?: number;
  overlap?: number;
  embedConcurrency?: number;
};

export type IngestKnowledgeResult = {
  docs: number;
  chunks: number;
};

function resolveEmbedConcurrency(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return DEFAULT_EMBED_CONCURRENCY;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(resolveEmbedConcurrency(concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    }),
  );

  return results;
}

export async function ingestKnowledge(
  options: IngestKnowledgeOptions = {},
): Promise<IngestKnowledgeResult> {
  const loadDocs = options.loadDocs ?? loadIngestDocs;
  const docs = options.docs ?? (await loadDocs());
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const chunker = options.chunker ?? chunkKnowledgeDocs;
  const embedder = options.embedder ?? new OllamaEmbedder();
  const store = options.store ?? new PgVectorStore();
  const embedConcurrency = resolveEmbedConcurrency(options.embedConcurrency);
  const chunks = chunker(docs, { chunkSize, overlap });

  await store.ensureCollection();

  const sources = [...new Set(chunks.map((chunk) => chunk.source))];
  for (const source of sources) {
    await store.deleteBySource(source);
  }

  const points = await mapWithConcurrency(chunks, embedConcurrency, async (chunk) => ({
    ...chunk,
    embedding: await embedder.embed(chunk.text),
  }));

  await store.upsert(points);

  return {
    docs: docs.length,
    chunks: chunks.length,
  };
}
