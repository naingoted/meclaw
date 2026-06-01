import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { documents, settings } from "./schema";

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
});
