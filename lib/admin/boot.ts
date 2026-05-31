import { initDb } from "@/lib/db";
import { resetOrphanedJobs } from "./ingest-runner";

let done = false;
/** Idempotent: reset orphaned 'running' jobs once per process. Call from instrumentation. */
export async function adminBoot() {
  if (done) return;
  done = true;
  try { await resetOrphanedJobs(await initDb()); }
  catch (e) { console.warn("[admin] boot reset skipped:", e instanceof Error ? e.message : e); }
}
