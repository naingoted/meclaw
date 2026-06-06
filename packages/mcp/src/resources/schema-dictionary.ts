/** Hand-written semantic layer: what each table/key column means. */
// fallow-ignore-next-line unused-export
export const SCHEMA_DICTIONARY: Record<string, string> = {
  conversations: "One row per chat session.",
  messages: "Individual chat messages (role: user|assistant|tool). content is PII.",
  leads: "Captured visitor contact info (email/phone). PII.",
  documents: "Knowledge documents ingested into the corpus.",
  rag_chunks: "Embedded chunks of documents for semantic retrieval.",
  chat_misses: "Turns where retrieval failed or the bot deferred.",
  gap_clusters: "Clustered recurring misses (content gaps).",
  ingestion_jobs: "Status of corpus ingestion runs.",
};

export function schemaDictionaryJson(): string {
  return JSON.stringify(SCHEMA_DICTIONARY, null, 2);
}
