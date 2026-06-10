import { describe, expect, it } from "vitest";
import { listConversationMessages, saveTurn } from "./index";
import { makeTestDb } from "./test-db";

describe("listConversationMessages", () => {
  it("returns prior turns ordered by createdAt, limited", async () => {
    const { db } = await makeTestDb();
    const convId = "conv-list-1";

    await saveTurn(
      db as never,
      [{ role: "user", content: "first" }],
      { role: "assistant", content: "reply-1" },
      convId,
    );
    // Ensure different timestamps for deterministic ordering
    await new Promise((r) => setTimeout(r, 5));
    await saveTurn(
      db as never,
      [{ role: "user", content: "second" }],
      { role: "assistant", content: "reply-2" },
      convId,
    );
    await new Promise((r) => setTimeout(r, 5));
    await saveTurn(
      db as never,
      [{ role: "user", content: "other-conv" }],
      { role: "assistant", content: "other" },
      "conv-other",
    );

    const rows = await listConversationMessages(db as never, convId, 10);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(rows.map((r) => r.content)).toEqual(["first", "reply-1", "second", "reply-2"]);
  });

  it("respects the limit", async () => {
    const { db } = await makeTestDb();
    const convId = "conv-list-2";
    await saveTurn(
      db as never,
      [{ role: "user", content: "a" }],
      { role: "assistant", content: "b" },
      convId,
    );
    await new Promise((r) => setTimeout(r, 5));
    await saveTurn(
      db as never,
      [{ role: "user", content: "c" }],
      { role: "assistant", content: "d" },
      convId,
    );

    const rows = await listConversationMessages(db as never, convId, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.content)).toEqual(["c", "d"]);
  });

  it("returns [] for unknown conversationId", async () => {
    const { db } = await makeTestDb();
    const rows = await listConversationMessages(db as never, "does-not-exist", 50);
    expect(rows).toEqual([]);
  });

  it("handles postgres-js execute results (bare array, no .rows wrapper)", async () => {
    // drizzle-orm/postgres-js returns the row array directly from db.execute(),
    // unlike PGlite (used by makeTestDb) which wraps rows in { rows: [...] }.
    const createdAt = new Date("2026-06-10T00:00:00Z");
    const stubDb = {
      execute: async () => [{ id: "m1", role: "user", content: "hi", createdAt }],
    };
    const rows = await listConversationMessages(stubDb as never, "conv-pgjs", 10);
    expect(rows).toEqual([{ id: "m1", role: "user", content: "hi", createdAt }]);
  });
});
