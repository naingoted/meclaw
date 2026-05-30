import { pathToFileURL } from "node:url";

import { ingestKnowledge } from "../lib/rag/ingest";
import { OllamaEmbedder } from "../lib/rag/embed";
import { QdrantClient } from "../lib/rag/qdrant";

export async function runIngestCli(): Promise<void> {
  try {
    const embedder = new OllamaEmbedder({
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL,
    });

    const store = new QdrantClient({
      url: process.env.QDRANT_URL,
      collection: process.env.QDRANT_COLLECTION,
    });

    const result = await ingestKnowledge({
      embedder,
      store,
    });
    console.log(`Ingested ${result.docs} docs into ${result.chunks} chunks.`);
  } catch (error) {
    console.error("Knowledge ingestion failed.", error);
    process.exitCode = 1;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  void runIngestCli();
}
