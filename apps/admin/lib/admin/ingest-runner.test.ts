import { describe, it, expect } from "vitest";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { createDocument } from "./documents";
import { enqueueSingle, enqueueAllDirty, runNextJob, resetOrphanedJobs } from "./ingest-runner";
import { ingestionJobs, documents } from "@meclaw/core/db/schema";
import { eq } from "drizzle-orm";

describe("ingestion runner", () => {
  it("runs a queued single job to success: sets chunksWritten, lastIngestedAt, status=ready", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "A", body: "hello world" }, "ip");
    const job = await enqueueSingle(db, doc.id, "ip");
    await runNextJob(db, { ingestFn: async () => ({ chunks: 3 }) });
    const j = (await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, job.id)))[0];
    const d = (await db.select().from(documents).where(eq(documents.id, doc.id)))[0];
    expect(j.status).toBe("succeeded");
    expect(j.chunksWritten).toBe(3);
    expect(d.status).toBe("ready");
    expect(d.lastIngestedAt).not.toBeNull();
  });

  it("captures errors: status=failed + error text, document status=error", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "A", body: "x" }, "ip");
    await enqueueSingle(db, doc.id, "ip");
    await runNextJob(db, { ingestFn: async () => { throw new Error("ollama down"); } });
    const j = (await db.select().from(ingestionJobs))[0];
    const d = (await db.select().from(documents).where(eq(documents.id, doc.id)))[0];
    expect(j.status).toBe("failed");
    expect(j.error).toContain("ollama down");
    expect(d.status).toBe("error");
  });

  it("enqueueAllDirty queues exactly the dirty documents", async () => {
    const { db } = await makeTestDb();
    await createDocument(db, { title: "dirty1", body: "a" }, "ip"); // never ingested → dirty
    const clean = await createDocument(db, { title: "clean", body: "b" }, "ip");
    await db.update(documents).set({ lastIngestedAt: new Date(Date.now() + 1000), status: "ready" }).where(eq(documents.id, clean.id)).execute();
    const jobs = await enqueueAllDirty(db, "ip");
    expect(jobs).toHaveLength(1);
  });

  it("resetOrphanedJobs flips running → failed on boot", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "A", body: "x" }, "ip");
    const job = await enqueueSingle(db, doc.id, "ip");
    await db.update(ingestionJobs).set({ status: "running" }).where(eq(ingestionJobs.id, job.id)).execute();
    await resetOrphanedJobs(db);
    const j = (await db.select().from(ingestionJobs))[0];
    expect(j.status).toBe("failed");
  });

  it("passes documents.origin through to ingestFn", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "Q?", body: "A.", origin: "gap" }, "ip");
    await enqueueSingle(db, doc.id, "ip");
    let seenOrigin: string | undefined;
    await runNextJob(db, {
      ingestFn: async (d) => { seenOrigin = d.origin; return { chunks: 1 }; },
    });
    expect(seenOrigin).toBe("gap");
  });

  it("defaults origin to 'manual' for documents created without one", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "M", body: "body" }, "ip");
    await enqueueSingle(db, doc.id, "ip");
    let seenOrigin: string | undefined;
    await runNextJob(db, {
      ingestFn: async (d) => { seenOrigin = d.origin; return { chunks: 1 }; },
    });
    expect(seenOrigin).toBe("manual");
  });
});
