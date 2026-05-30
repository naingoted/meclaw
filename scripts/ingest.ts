import { pathToFileURL } from "node:url";

import { ingestKnowledge } from "../lib/rag/ingest";
import { embedderFromEnv, storeFromEnv } from "../lib/rag/config";

export async function runIngestCli(): Promise<void> {
  try {
    const result = await ingestKnowledge({
      embedder: embedderFromEnv(),
      store: storeFromEnv(),
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
