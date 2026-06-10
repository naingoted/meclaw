import { makeTestDb } from "@meclaw/core/db/test-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db() and clientIp() from request.ts
vi.mock("@/lib/admin/request", () => ({
  db: vi.fn(),
  clientIp: () => "127.0.0.1",
}));

describe("POST /api/admin/gaps/[id]/resolve", () => {
  let dbh: Awaited<ReturnType<typeof makeTestDb>>;

  beforeEach(async () => {
    dbh = await makeTestDb();
    const { db: mockDb } = await import("@/lib/admin/request");
    (mockDb as ReturnType<typeof vi.fn>).mockResolvedValue(dbh.db);
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "", body: "" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "test-id" }) });
    expect(res.status).toBe(400);
  });

  it("creates document + job + resolves cluster atomically", async () => {
    const { db } = dbh;
    const { gapClusters } = await import("@meclaw/core/db/schema");
    const { eq } = await import("drizzle-orm");

    // Seed a gap cluster
    const now = new Date();
    await db
      .insert(gapClusters)
      .values({
        id: "00000000-0000-0000-0000-000000000001",
        centroid: Array(768).fill(0),
        count: 1,
        status: "new",
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const { POST } = await import("./route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        title: "Test answer",
        body: "This is the answer.",
      }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documentId).toBeDefined();
    expect(body.jobId).toBeDefined();

    // Verify cluster is now resolved
    const clusters = await db
      .select()
      .from(gapClusters)
      .where(eq(gapClusters.id, "00000000-0000-0000-0000-000000000001"));
    expect(clusters[0].status).toBe("resolved");
    expect(clusters[0].resolvedDocumentId).toBe(body.documentId);
  });
});
