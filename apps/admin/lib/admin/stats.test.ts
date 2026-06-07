import { randomUUID } from "node:crypto";
import { ingestionJobs } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it } from "vitest";
import { createDocument } from "./documents";
import { computeStats } from "./stats";

type JobInsert = typeof ingestionJobs.$inferInsert;
const job = (over: Partial<JobInsert>): JobInsert => ({
  id: randomUUID(),
  documentId: null,
  kind: "single",
  status: "queued",
  error: null,
  chunksWritten: null,
  createdAt: new Date(),
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("computeStats", () => {
  it("counts documents and dirty docs", async () => {
    const { db } = await makeTestDb();
    await createDocument(db, { title: "A", body: "a" }, "ip");
    const stats = await computeStats(db);
    expect(stats.documents).toBe(1);
    expect(stats.dirty).toBe(1);
  });

  it("reports zeros and null lastIngest on an empty db", async () => {
    const { db } = await makeTestDb();
    const stats = await computeStats(db);
    expect(stats.documents).toBe(0);
    expect(stats.dirty).toBe(0);
    expect(stats.lastIngest).toBeNull();
  });

  it("lastIngest is the finishedAt of the most-recently-created succeeded job", async () => {
    const { db } = await makeTestDb();
    const latest = new Date("2026-02-01T00:00:00.000Z");
    // Inserted out of createdAt order; listJobs sorts ASC, so the newest
    // succeeded job must win regardless of insertion order.
    await db
      .insert(ingestionJobs)
      .values(
        job({
          status: "succeeded",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          finishedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      )
      .execute();
    await db
      .insert(ingestionJobs)
      .values(
        job({
          status: "succeeded",
          createdAt: latest,
          finishedAt: latest,
        }),
      )
      .execute();
    // A later-created FAILED job must not be picked as the last ingest.
    await db
      .insert(ingestionJobs)
      .values(
        job({
          status: "failed",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          finishedAt: new Date("2026-03-01T00:00:00.000Z"),
        }),
      )
      .execute();
    const stats = await computeStats(db);
    expect(stats.lastIngest).toBe(latest.toISOString());
  });
});
