import { count, eq, max } from "drizzle-orm";
import { documents, ingestionJobs, ragChunks } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";

/**
 * Derived corpus state — the TS half of the corpus contract.
 * See docs/ai/rag-corpus-contract.md (Python mirror: services/ai/app/corpus.py).
 * No schema change: version = count of succeeded ingestion jobs (monotonic).
 */
export interface CorpusState {
  version: number;
  documents: number;
  chunks: number;
  lastIngestedAt: string | null;
  embedModel: string;
}

export async function getCorpusState(db: Db): Promise<CorpusState> {
  const [{ value: version }] = await db
    .select({ value: count() })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.status, "succeeded"));
  const [{ value: docs }] = await db
    .select({ value: count() })
    .from(documents)
    .where(eq(documents.status, "ready"));
  const [{ value: chunks }] = await db
    .select({ value: count() })
    .from(ragChunks);
  const [{ value: last }] = await db
    .select({ value: max(documents.lastIngestedAt) })
    .from(documents);

  return {
    version,
    documents: docs,
    chunks,
    lastIngestedAt: last ? new Date(last).toISOString() : null,
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  };
}
