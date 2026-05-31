import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { logAudit, recentAudit } from "./audit";

describe("audit service", () => {
  it("appends entries and lists them newest-first", async () => {
    const { db } = await makeTestDb();
    await logAudit(db, { action: "document.create", entityType: "document", entityId: "d1", summary: "created A", actorIp: "127.0.0.1" });
    await logAudit(db, { action: "config.update", entityType: "settings", entityId: "1", summary: "changed draft model", actorIp: "127.0.0.1" });
    const rows = await recentAudit(db, 10);
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe("changed draft model"); // newest first
  });
});
