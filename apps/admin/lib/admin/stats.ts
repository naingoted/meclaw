import type { Db } from "@meclaw/core/db/types";
import { isDirty, listDocuments } from "./documents";
import { listJobs } from "./ingest-runner";

export interface StatsResult {
  documents: number;
  dirty: number;
  lastIngest: string | null;
}

export async function computeStats(db: Db): Promise<StatsResult> {
  const docs = await listDocuments(db);
  const jobs = await listJobs(db, 100);
  const succeeded = jobs.filter((j) => j.status === "succeeded");
  const lastIngest = succeeded.length ? succeeded[succeeded.length - 1].finishedAt : null;

  return {
    documents: docs.length,
    dirty: docs.filter(isDirty).length,
    lastIngest: lastIngest ? lastIngest.toISOString() : null,
  };
}
