import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { documents, ingestionJobs } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { ingesterFor, type IngestDocumentResult } from "@meclaw/rag";
import { listDocuments, isDirty } from "./documents";
import { logAudit } from "@meclaw/core/settings";

type IngestFn = (doc: { id: string; title: string; body: string; kind: string; origin: string }) => Promise<IngestDocumentResult>;

export async function enqueueSingle(db: Db, documentId: string, actorIp: string) {
  const row = { id: randomUUID(), documentId, kind: "single" as const, status: "queued" as const, error: null, chunksWritten: null, createdAt: new Date(), startedAt: null, finishedAt: null };
  await db.insert(ingestionJobs).values(row).execute();
  await logAudit(db, { action: "ingest.start", entityType: "job", entityId: row.id, summary: `queued ingest for ${documentId}`, actorIp });
  scheduleDrain(db);
  return row;
}

export async function enqueueAllDirty(db: Db, actorIp: string) {
  const dirty = (await listDocuments(db)).filter(isDirty);
  const jobs = [];
  for (const d of dirty) jobs.push(await enqueueSingle(db, d.id, actorIp));
  return jobs;
}

/** Flip jobs left 'running' by a crash/restart to 'failed' so the UI never hangs. */
export async function resetOrphanedJobs(db: Db) {
  await db.update(ingestionJobs).set({ status: "failed", error: "interrupted by restart", finishedAt: new Date() }).where(eq(ingestionJobs.status, "running")).execute();
}

/** Claim and run the oldest queued job. Injectable ingestFn for tests. */
export async function runNextJob(db: Db, opts: { ingestFn?: IngestFn } = {}): Promise<boolean> {
  const ingestFn = opts.ingestFn ?? ((doc) => ingesterFor(doc.kind).ingest(doc));
  const queued = await db.select().from(ingestionJobs).where(eq(ingestionJobs.status, "queued")).orderBy(asc(ingestionJobs.createdAt)).limit(1);
  const job = queued[0];
  if (!job) return false;

  await db.update(ingestionJobs).set({ status: "running", startedAt: new Date() }).where(eq(ingestionJobs.id, job.id)).execute();
  const doc = (await db.select().from(documents).where(eq(documents.id, job.documentId!)))[0];
  try {
    if (!doc) throw new Error("document not found");
    const result = await ingestFn({ id: doc.id, title: doc.title, body: doc.body, kind: doc.kind, origin: doc.origin });
    const now = new Date();
    await db.update(ingestionJobs).set({ status: "succeeded", chunksWritten: result.chunks, finishedAt: now }).where(eq(ingestionJobs.id, job.id)).execute();
    await db.update(documents).set({ status: "ready", lastIngestedAt: now }).where(eq(documents.id, doc.id)).execute();
    await logAudit(db, { action: "ingest.succeed", entityType: "job", entityId: job.id, summary: `ingested "${doc.title}" (${result.chunks} chunks)` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(ingestionJobs).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(ingestionJobs.id, job.id)).execute();
    if (doc) await db.update(documents).set({ status: "error" }).where(eq(documents.id, doc.id)).execute();
    await logAudit(db, { action: "ingest.fail", entityType: "job", entityId: job.id, summary: `ingest failed: ${msg}` });
  }
  return true;
}

// --- in-process drain loop (single worker, sequential) ----------------------
let draining = false;
function scheduleDrain(db: Db) {
  if (process.env.VITEST) return; // tests drive runNextJob() explicitly; no background drain
  if (draining) return;
  draining = true;
  // Defer so enqueue returns immediately; drain until the queue empties.
  void (async () => {
    try { while (await runNextJob(db)) { /* keep going */ } }
    finally { draining = false; }
  })();
}

export async function retryJob(db: Db, jobId: string, actorIp: string) {
  const job = (await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, jobId)))[0];
  if (!job) return null;
  await db.update(ingestionJobs).set({ status: "queued", error: null, startedAt: null, finishedAt: null }).where(eq(ingestionJobs.id, jobId)).execute();
  await logAudit(db, { action: "ingest.start", entityType: "job", entityId: jobId, summary: "retry queued", actorIp });
  scheduleDrain(db);
  return job;
}

export async function listJobs(db: Db, limit = 50) {
  return db.select().from(ingestionJobs).orderBy(asc(ingestionJobs.createdAt)).limit(limit);
}
