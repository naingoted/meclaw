import { describe, expect, it } from "vitest";
import postgres from "postgres";

const URL = process.env.MCP_TEST_DATABASE_URL; // ro role against an ephemeral DB
const maybe = URL ? describe : describe.skip;

maybe("read-only role (integration)", () => {
  it("rejects a write through the ro connection", async () => {
    const sql = postgres(URL!, { max: 1 });
    try {
      await expect(sql`CREATE TABLE _should_fail (x int)`).rejects.toThrow(/permission denied|read-only/i);
    } finally {
      await sql.end();
    }
  });
});
