import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { documents, ingestionJobs, ragChunks } from "@meclaw/core/db/schema";
import { getCorpusState } from "./corpus";

describe("getCorpusState", () => {
  let dbh: Awaited<ReturnType<typeof makeTestDb>>;
  beforeEach(async () => {
    dbh = await makeTestDb();
  });
  afterEach(async () => {
    await dbh.client.close();
  });

  it("derives version, counts, and lastIngestedAt", async () => {
    const { db } = dbh;
    const ingestedAt = new Date("2026-06-02T18:00:00.000Z");
    const docId = randomUUID();
    await db.insert(documents).values({
      id: docId,
      title: "About",
      body: "b",
      kind: "markdown",
      status: "ready",
      contentHash: "h",
      createdAt: ingestedAt,
      updatedAt: ingestedAt,
      lastIngestedAt: ingestedAt,
    });
    // a draft doc must NOT count toward `documents`
    await db.insert(documents).values({
      id: randomUUID(),
      title: "Draft",
      body: "b",
      kind: "markdown",
      status: "draft",
      contentHash: "h2",
      createdAt: ingestedAt,
      updatedAt: ingestedAt,
      lastIngestedAt: null,
    });
    // two succeeded jobs => version 2; a failed job must not count
    for (const status of ["succeeded", "succeeded", "failed"] as const) {
      await db.insert(ingestionJobs).values({
        id: randomUUID(),
        documentId: docId,
        kind: "single",
        status,
        error: null,
        chunksWritten: status === "failed" ? null : 3,
        createdAt: ingestedAt,
        startedAt: ingestedAt,
        finishedAt: ingestedAt,
      });
    }
    await db.insert(ragChunks).values([
      {
        id: "c0",
        source: `document:${docId}`,
        title: "About",
        text: "t",
        ordinal: 0,
        embedding: Array(768).fill(0),
      },
      {
        id: "c1",
        source: `document:${docId}`,
        title: "About",
        text: "t",
        ordinal: 1,
        embedding: Array(768).fill(0),
      },
    ]);

    const state = await getCorpusState(db);
    expect(state.version).toBe(2);
    expect(state.documents).toBe(1);
    expect(state.chunks).toBe(2);
    expect(state.lastIngestedAt).toBe("2026-06-02T18:00:00.000Z");
    expect(state.embedModel).toBeTypeOf("string");
  });

  it("returns zeros and null timestamp on an empty corpus", async () => {
    const state = await getCorpusState(dbh.db);
    expect(state).toMatchObject({
      version: 0,
      documents: 0,
      chunks: 0,
      lastIngestedAt: null,
    });
  });
});
