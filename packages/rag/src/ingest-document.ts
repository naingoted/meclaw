import { chunkKnowledgeDocs } from "./chunk";
import { embedderFromEnv, storeFromEnv } from "./config";
import type { EmbeddingClient, VectorStoreClient, RagChunk } from "./types";

export type IngestDocumentInput = { id: string; title: string; body: string; origin: string };
export type IngestDocumentOptions = {
  store?: VectorStoreClient;
  embedder?: EmbeddingClient;
  chunkSize?: number;
  overlap?: number;
};
export type IngestDocumentResult = { chunks: number };

/**
 * Ingest ONE document record into pgvector, scoped by its `source` label.
 * Replace semantics: delete this document's existing chunks (deleteBySource),
 * then upsert the freshly chunked + embedded set — so an edit never leaves
 * stale vectors. The `document:<id>` slug becomes chunk.source, so the store
 * needs no `documentId` column — the existing `deleteBySource` already scopes
 * the delete per document. (Reuses lib/rag/config's env-built pgvector store.)
 */
export async function ingestDocument(
  doc: IngestDocumentInput,
  options: IngestDocumentOptions = {},
): Promise<IngestDocumentResult> {
  const store = options.store ?? storeFromEnv();
  const embedder = options.embedder ?? embedderFromEnv();
  const chunkSize = options.chunkSize ?? 1200;
  const overlap = options.overlap ?? 180;

  // Reuse the existing chunker; the `document:<id>` slug becomes chunk.source
  // (chunk.ts sets source = slug), namespacing this document's chunks.
  const source = `document:${doc.id}`;
  // Gap documents store the answer in the body and the question in the title.
  // Manual/seed documents lead their body with an H1 by convention, so the title
  // is already embedded. Prepend the title as an H1 for gap docs to bring them to
  // parity — the question lands in chunk[0].text and is embedded, so a matching
  // query ranks the doc within RAG_TOP_K. Done in-memory; documents.body is untouched.
  const embedBody = doc.origin === "gap" ? `# ${doc.title}\n\n${doc.body}` : doc.body;
  const knowledgeDoc = { slug: source, title: doc.title, body: embedBody };
  const chunks = chunkKnowledgeDocs([knowledgeDoc], { chunkSize, overlap });

  await store.ensureCollection();
  await store.deleteBySource(source);

  const points: Array<RagChunk & { embedding: number[] }> = [];
  for (const chunk of chunks) {
    points.push({ ...chunk, embedding: await embedder.embed(chunk.text) });
  }
  await store.upsert(points);
  return { chunks: chunks.length };
}

/**
 * Ingester seam keyed by `documents.kind`. v1 registers ONLY markdown.
 * Future kinds (pdf/image/…) register here in their own spec; the ingestion
 * runner dispatches via `ingesterFor(doc.kind)` and never changes.
 */
export interface Ingester {
  ingest(doc: IngestDocumentInput, options?: IngestDocumentOptions): Promise<IngestDocumentResult>;
}

const INGESTERS: Record<string, Ingester> = {
  markdown: { ingest: ingestDocument },
};

export function ingesterFor(kind: string): Ingester {
  const ingester = INGESTERS[kind];
  if (!ingester) throw new Error(`No ingester registered for document kind '${kind}'`);
  return ingester;
}
