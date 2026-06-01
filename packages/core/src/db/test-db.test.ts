import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { conversations } from "./schema";

describe("makeTestDb", () => {
  it("creates an isolated drizzle instance with the schema applied", async () => {
    const { db } = await makeTestDb();
    await db.insert(conversations).values({ id: "c1", createdAt: new Date() }).execute();
    const rows = await db.select().from(conversations);
    expect(rows).toHaveLength(1);
  });
});
