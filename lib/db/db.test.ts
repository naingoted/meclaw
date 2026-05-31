import { describe, expect, it } from "vitest";
import { saveTurn, type PersistentMessage } from "./index";

/**
 * saveTurn persistence — mocked tests (no DB needed).
 * Asserts the async transaction inserts exactly: conversation, last user
 * message, assistant message — in that order, with toolCalls JSON parsed.
 */
function makeMockDb() {
  const inserts: Record<string, unknown>[] = [];
  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return Promise.resolve();
      },
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<void>) => {
      await fn(tx);
    },
  };
  return { db, inserts };
}

describe("saveTurn (mocked)", () => {
  it("returns a UUID conversationId", async () => {
    const { db } = makeMockDb();
    const id = await saveTurn(
      db as never,
      [{ role: "user", content: "Hi" }],
      { role: "assistant", content: "Hello" },
    );
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("inserts conversation + last user msg + assistant msg (in order)", async () => {
    const { db, inserts } = makeMockDb();
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "First" },
      { role: "user", content: "Second" }, // only this one persists
    ];
    await saveTurn(db as never, userMessages, {
      role: "assistant",
      content: "Reply",
    });

    expect(inserts).toHaveLength(3);
    // [0] is the conversation row (has id, no role)
    expect(inserts[0]).toHaveProperty("id");
    expect(inserts[0].role).toBeUndefined();
    // [1] is the LAST user message
    expect(inserts[1].role).toBe("user");
    expect(inserts[1].content).toBe("Second");
    // [2] is the assistant message
    expect(inserts[2].role).toBe("assistant");
    expect(inserts[2].content).toBe("Reply");
  });

  it("parses the toolCalls JSON string into an object for jsonb", async () => {
    const { db, inserts } = makeMockDb();
    const toolCalls = JSON.stringify([{ id: "t1", toolName: "test" }]);
    await saveTurn(db as never, [{ role: "user", content: "Use tool" }], {
      role: "assistant",
      content: "Using…",
      toolCalls,
    });
    expect(inserts[2].toolCalls).toEqual([{ id: "t1", toolName: "test" }]);
  });

  it("stores null toolCalls when none provided", async () => {
    const { db, inserts } = makeMockDb();
    await saveTurn(db as never, [{ role: "user", content: "Hi" }], {
      role: "assistant",
      content: "Hello",
    });
    expect(inserts[2].toolCalls).toBeNull();
  });
});

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("saveTurn (integration, real Postgres)", () => {
  it("persists one user + one assistant message per turn", async () => {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { runMigrations } = await import("./migrate");
    const schema = await import("./schema");

    await runMigrations(DATABASE_URL);

    const sql = postgres(DATABASE_URL!, { max: 1 });
    try {
      const db = drizzle(sql, { schema });

      const convId = await saveTurn(
        db as never,
        [
          { role: "user", content: "First" },
          { role: "user", content: "Second" },
        ],
        { role: "assistant", content: "Reply" },
      );

      const rows = await sql<{ role: string; content: string }[]>`
        SELECT role, content FROM messages WHERE "conversationId" = ${convId}
      `;
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.role).sort()).toEqual(["assistant", "user"]);
      const userRow = rows.find((r) => r.role === "user");
      expect(userRow?.content).toBe("Second");
    } finally {
      await sql.end();
    }
  });
});
