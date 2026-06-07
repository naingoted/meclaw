import { describe, expect, it } from "vitest";
import { conversations } from "./schema";
import { makeTestDb } from "./test-db";

describe("makeTestDb", () => {
  it("creates an isolated drizzle instance with the schema applied", async () => {
    const { db } = await makeTestDb();
    await db.insert(conversations).values({ id: "c1", createdAt: new Date() }).execute();
    const rows = await db.select().from(conversations);
    expect(rows).toHaveLength(1);
  });
});
