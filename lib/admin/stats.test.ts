import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { createDocument } from "./documents";
import { computeStats } from "./stats";

describe("computeStats", () => {
  it("counts documents and dirty docs", async () => {
    const { db } = await makeTestDb();
    await createDocument(db, { title: "A", body: "a" }, "ip");
    const stats = await computeStats(db);
    expect(stats.documents).toBe(1);
    expect(stats.dirty).toBe(1);
  });
});
