import { describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("migrations (real Postgres)", () => {
  it("apply cleanly and create the conversations + messages tables", async () => {
    const postgres = (await import("postgres")).default;
    const { runMigrations } = await import("./migrate");

    await runMigrations(DATABASE_URL);
    await runMigrations(DATABASE_URL);

    const sql = postgres(DATABASE_URL!, { max: 1 });
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('conversations', 'messages')
        ORDER BY table_name
      `;
      expect(tables.map((t) => t.table_name)).toEqual([
        "conversations",
        "messages",
      ]);

      const cols = await sql<{ column_name: string; data_type: string }[]>`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'messages'
      `;
      const byName = Object.fromEntries(
        cols.map((c) => [c.column_name, c.data_type]),
      );
      expect(byName["toolCalls"]).toBe("jsonb");
      expect(byName["createdAt"]).toBe("timestamp with time zone");
    } finally {
      await sql.end();
    }
  });
});
