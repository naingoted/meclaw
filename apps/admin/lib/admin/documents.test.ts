import { gapClusters } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { recentAudit } from "@meclaw/core/settings";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDocument,
  deleteDocument,
  getDocument,
  isDirty,
  listDocuments,
  updateDocument,
} from "./documents";

describe("document service", () => {
  it("creates a document, hashes body, writes an audit row, and is dirty (never ingested)", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(
      db,
      { title: "Resume", body: "# Resume", category: "resume" },
      "127.0.0.1",
    );
    expect(doc.contentHash).toHaveLength(64);
    expect(isDirty(doc)).toBe(true);
    const audit = await recentAudit(db, 10);
    expect(audit[0].action).toBe("document.create");
  });

  it("update changes contentHash when body changes and re-marks dirty", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "A", body: "one" }, "ip");
    const updated = await updateDocument(db, doc.id, { title: "A", body: "two" }, "ip");
    expect(updated.contentHash).not.toBe(doc.contentHash);
  });

  it("a document ingested after its last edit is not dirty", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T01:00:00Z");
    expect(isDirty({ updatedAt: t0, lastIngestedAt: t1 })).toBe(false);
    expect(isDirty({ updatedAt: t1, lastIngestedAt: t0 })).toBe(true);
  });

  it("delete removes the row and audits it", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "A", body: "x" }, "ip");
    await deleteDocument(db, doc.id, "ip");
    expect(await getDocument(db, doc.id)).toBeUndefined();
  });

  it("defaults origin to 'manual' and persists 'gap' when supplied", async () => {
    const { db } = await makeTestDb();
    const manual = await createDocument(db, { title: "M", body: "m" }, "ip");
    const gap = await createDocument(db, { title: "G", body: "g", origin: "gap" }, "ip");
    expect(manual.origin).toBe("manual");
    expect(gap.origin).toBe("gap");
  });

  it("listDocuments filters by origin", async () => {
    const { db } = await makeTestDb();
    await createDocument(db, { title: "M", body: "m" }, "ip");
    await createDocument(db, { title: "G", body: "g", origin: "gap" }, "ip");
    const gapOnly = await listDocuments(db, "gap");
    expect(gapOnly.map((d) => d.title)).toEqual(["G"]);
    const all = await listDocuments(db);
    expect(all.length).toBe(2);
  });

  it("deleting a gap-resolution document flips its resolved cluster back to 'new'", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "Q?", body: "A.", origin: "gap" }, "ip");
    const other = await createDocument(db, { title: "Other", body: "B.", origin: "gap" }, "ip");
    const now = new Date();
    const linked = "33333333-3333-4333-8333-333333333333";
    const untouched = "44444444-4444-4444-8444-444444444444";
    await db
      .insert(gapClusters)
      .values([
        {
          id: linked,
          centroid: Array(768).fill(0),
          count: 1,
          status: "resolved",
          exemplarQuery: "Q?",
          resolvedDocumentId: doc.id,
          resolvedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: untouched,
          centroid: Array(768).fill(0),
          count: 1,
          status: "resolved",
          exemplarQuery: "Other?",
          resolvedDocumentId: other.id,
          resolvedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await deleteDocument(db, doc.id, "ip");

    const [flipped] = await db.select().from(gapClusters).where(eq(gapClusters.id, linked));
    expect(flipped.status).toBe("new");
    expect(flipped.resolvedDocumentId).toBeNull();
    expect(flipped.resolvedAt).toBeNull();
    const [kept] = await db.select().from(gapClusters).where(eq(gapClusters.id, untouched));
    expect(kept.status).toBe("resolved");
    // delete is still audited
    const audit = await recentAudit(db, 10);
    expect(audit[0].action).toBe("document.delete");
  });
});
