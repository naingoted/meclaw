import { chatMisses, gapClusters } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it } from "vitest";
import { exportMissesCsv, getCluster, ignoreCluster, listClusters, resolveCluster } from "./gaps";

async function seed(db: Awaited<ReturnType<typeof makeTestDb>>["db"]) {
  const now = new Date();
  const big = "11111111-1111-4111-8111-111111111111";
  const small = "22222222-2222-4222-8222-222222222222";
  await db
    .insert(gapClusters)
    .values([
      {
        id: big,
        centroid: Array(768).fill(0),
        count: 5,
        status: "new",
        exemplarQuery: "salary?",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: small,
        centroid: Array(768).fill(0),
        count: 2,
        status: "new",
        exemplarQuery: "relocation?",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
  await db
    .insert(chatMisses)
    .values([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        messageId: "m1",
        conversationId: "c1",
        clusterId: big,
        query: "salary?",
        reason: "floor",
        topScore: 0.2,
        createdAt: now,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        messageId: "m2",
        conversationId: "c1",
        clusterId: big,
        query: "his pay?",
        reason: "fallback",
        topScore: null,
        createdAt: now,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        messageId: "m3",
        conversationId: "c2",
        clusterId: small,
        query: "relocate?",
        reason: "clarify",
        topScore: null,
        createdAt: now,
      },
    ])
    .execute();
  return { big, small };
}

describe("admin gaps lib", () => {
  it("listClusters ranks by count desc and includes reason mix", async () => {
    const { db } = await makeTestDb();
    const { big } = await seed(db);
    const rows = await listClusters(db, "new");
    expect(rows.map((r) => r.id)).toEqual([big, expect.any(String)]); // big first
    expect(rows[0].count).toBe(5);
    expect(rows[0].reasons).toEqual({ floor: 1, fallback: 1 });
  });

  it("getCluster returns the cluster + its member misses", async () => {
    const { db } = await makeTestDb();
    const { small } = await seed(db);
    const result = await getCluster(db, small);
    expect(result?.cluster.exemplarQuery).toBe("relocation?");
    expect(result?.misses).toHaveLength(1);
    expect(result?.misses[0].reason).toBe("clarify");
  });

  it("resolveCluster sets status + document link", async () => {
    const { db } = await makeTestDb();
    const { big } = await seed(db);
    const docId = "99999999-9999-4999-8999-999999999999";
    await resolveCluster(db, big, docId, "ip");
    const result = await getCluster(db, big);
    expect(result?.cluster.status).toBe("resolved");
    expect(result?.cluster.resolvedDocumentId).toBe(docId);
    expect(result?.cluster.resolvedAt).not.toBeNull();
    expect((await listClusters(db, "new")).map((r) => r.id)).not.toContain(big);
  });

  it("ignoreCluster hides the cluster from the new list", async () => {
    const { db } = await makeTestDb();
    const { small } = await seed(db);
    await ignoreCluster(db, small, "ip");
    expect((await listClusters(db, "new")).map((r) => r.id)).not.toContain(small);
    expect((await listClusters(db, "ignored")).map((r) => r.id)).toContain(small);
  });

  it("exportMissesCsv produces a header + escaped rows", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const csv = await exportMissesCsv(db);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("clusterId,query,reason,topScore,conversationId,createdAt");
    expect(lines).toHaveLength(4); // header + 3 misses
  });
});
