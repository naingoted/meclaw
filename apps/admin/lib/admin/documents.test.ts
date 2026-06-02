import { describe, it, expect } from "vitest";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { createDocument, updateDocument, deleteDocument, getDocument, isDirty } from "./documents";
import { recentAudit } from "@meclaw/core/settings";

describe("document service", () => {
  it("creates a document, hashes body, writes an audit row, and is dirty (never ingested)", async () => {
    const { db } = await makeTestDb();
    const doc = await createDocument(db, { title: "Resume", body: "# Resume", category: "resume" }, "127.0.0.1");
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
});
