import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb } from "./test-db";
import { documents, settings, gapClusters, chatMisses } from "./schema";

describe("admin schema", () => {
  it("documents/jobs/settings/audit tables accept inserts", async () => {
    const { db } = await makeTestDb();
    const now = new Date();
    await db.insert(documents).values({
      id: "11111111-1111-4111-8111-111111111111",
      title: "t", body: "b", status: "draft", contentHash: "h",
      createdAt: now, updatedAt: now,
    }).execute();
    await db.insert(settings).values({
      id: 1, agents: {}, shared: {}, rag: {}, public: {}, updatedAt: now,
    }).execute();
    const docs = await db.select().from(documents);
    expect(docs[0].title).toBe("t");
  });

  it("gap_clusters + chat_misses accept inserts; messageId is unique", async () => {
    const { db } = await makeTestDb();
    const now = new Date();
    const clusterId = "22222222-2222-4222-8222-222222222222";
    await db.insert(gapClusters).values({
      id: clusterId,
      centroid: Array(768).fill(0),
      count: 1,
      status: "new",
      exemplarQuery: "what's his salary?",
      createdAt: now,
      updatedAt: now,
    }).execute();

    await db.insert(chatMisses).values({
      id: "33333333-3333-4333-8333-333333333333",
      messageId: "msg-1",
      conversationId: "conv-1",
      clusterId,
      query: "what's his salary?",
      reason: "floor",
      topScore: 0.21,
      createdAt: now,
    }).execute();

    const clusters = await db.select().from(gapClusters);
    expect(clusters[0].count).toBe(1);
    const misses = await db.select().from(chatMisses);
    expect(misses[0].reason).toBe("floor");

    await expect(
      db.insert(chatMisses).values({
        id: "44444444-4444-4444-8444-444444444444",
        messageId: "msg-1",
        conversationId: "conv-1",
        clusterId,
        query: "dup",
        reason: "fallback",
        topScore: null,
        createdAt: now,
      }).execute(),
    ).rejects.toThrow();
  });

  it("documents.origin defaults to 'manual' and accepts 'gap'", async () => {
    const { db } = await makeTestDb();
    const now = new Date();
    await db.insert(documents).values({
      id: randomUUID(), title: "D", body: "b", kind: "markdown", category: null,
      status: "draft", contentHash: "x", createdAt: now, updatedAt: now, lastIngestedAt: null,
    }).execute();
    await db.insert(documents).values({
      id: randomUUID(), title: "G", body: "b", kind: "markdown", category: null,
      status: "draft", contentHash: "y", origin: "gap", createdAt: now, updatedAt: now, lastIngestedAt: null,
    }).execute();
    const rows = await db.select().from(documents);
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.origin]));
    expect(byTitle.D).toBe("manual");
    expect(byTitle.G).toBe("gap");
  });
});
