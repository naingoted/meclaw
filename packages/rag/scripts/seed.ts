import { pathToFileURL } from "node:url";
import { initDb } from "@meclaw/core/db";
import { embedderFromEnv, storeFromEnv } from "../src/config";
import { seedAndIngest } from "../src/seed";

export async function runSeedCli(): Promise<void> {
  try {
    const db = await initDb();
    const { imported, ingested, chunks } = await seedAndIngest(db, {
      ingestOptions: { embedder: embedderFromEnv(), store: storeFromEnv() },
    });
    console.log(`Seeded ${imported} new document(s); ingested ${ingested} into ${chunks} chunks.`);
  } catch (error) {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  void runSeedCli();
}
