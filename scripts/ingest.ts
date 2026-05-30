import { pathToFileURL } from "node:url";

import { ingestKnowledge } from "../lib/rag/ingest";

export async function runIngestCli(): Promise<void> {
  try {
    const result = await ingestKnowledge();
    console.log(`Ingested ${result.docs} docs into ${result.chunks} chunks.`);
  } catch {
    console.error("Knowledge ingestion failed.");
    process.exitCode = 1;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  void runIngestCli();
}
