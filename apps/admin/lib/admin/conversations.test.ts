import { chatMisses, conversations, messages } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it } from "vitest";
import { deriveOutcome, listConversations } from "./conversations";

const HOUR = 60 * 60 * 1000;

async function seed(db: Awaited<ReturnType<typeof makeTestDb>>["db"]) {
  const base = new Date("2026-06-10T00:00:00.000Z").getTime();
  const at = (mins: number) => new Date(base + mins * 60_000);

  // c1: answered (user then assistant, no miss)
  // c2: gap (has a chat_misses row)
  // c3: abandoned (trailing user message, stale)
  await db.insert(conversations).values([
    { id: "c1", createdAt: at(0) },
    { id: "c2", createdAt: at(10) },
    { id: "c3", createdAt: at(20) },
  ]);
  await db.insert(messages).values([
    {
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "what is your salary?",
      createdAt: at(0),
    },
    {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "I prefer not to share.",
      createdAt: at(1),
    },
    {
      id: "m3",
      conversationId: "c2",
      role: "user",
      content: "do you know rust?",
      createdAt: at(10),
    },
    {
      id: "m4",
      conversationId: "c2",
      role: "assistant",
      content: "I'm not sure.",
      createdAt: at(11),
    },
    { id: "m5", conversationId: "c3", role: "user", content: "hello? anyone?", createdAt: at(20) },
  ]);
  await db.insert(chatMisses).values({
    id: "00000000-0000-4000-8000-000000000001",
    messageId: "m4",
    conversationId: "c2",
    clusterId: "00000000-0000-4000-8000-0000000000aa",
    query: "do you know rust?",
    reason: "floor",
    topScore: 0.2,
    createdAt: at(11),
  });
  return { at };
}

describe("deriveOutcome", () => {
  const now = new Date("2026-06-10T05:00:00.000Z").getTime();
  it("gap when a miss exists", () => {
    expect(
      deriveOutcome({ hasMiss: true, lastRole: "assistant", lastMessageAt: new Date(now) }, now),
    ).toBe("gap");
  });
  it("answered when last message is assistant and no miss", () => {
    expect(
      deriveOutcome({ hasMiss: false, lastRole: "assistant", lastMessageAt: new Date(now) }, now),
    ).toBe("answered");
  });
  it("abandoned when last message is a stale user message", () => {
    expect(
      deriveOutcome(
        { hasMiss: false, lastRole: "user", lastMessageAt: new Date(now - 2 * HOUR) },
        now,
      ),
    ).toBe("abandoned");
  });
  it("answered when trailing user message is fresh (in-progress)", () => {
    expect(
      deriveOutcome(
        { hasMiss: false, lastRole: "user", lastMessageAt: new Date(now - 60_000) },
        now,
      ),
    ).toBe("answered");
  });
});

describe("listConversations", () => {
  const wide = { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-07-01T00:00:00Z") };

  it("returns newest-first summaries with computed fields", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const res = await listConversations(db, wide);
    expect(res.items.map((c) => c.id)).toEqual(["c3", "c2", "c1"]); // createdAt desc
    const c1 = res.items.find((c) => c.id === "c1")!;
    expect(c1.turnCount).toBe(1);
    expect(c1.firstUserPreview).toBe("what is your salary?");
    expect(c1.outcome).toBe("answered");
    expect(res.items.find((c) => c.id === "c2")!.outcome).toBe("gap");
  });

  it("filters by outcome", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const res = await listConversations(db, { ...wide, outcome: "gap" });
    expect(res.items.map((c) => c.id)).toEqual(["c2"]);
  });

  it("paginates with a cursor", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const page1 = await listConversations(db, { ...wide, limit: 2 });
    expect(page1.items.map((c) => c.id)).toEqual(["c3", "c2"]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listConversations(db, { ...wide, limit: 2, cursor: page1.nextCursor });
    expect(page2.items.map((c) => c.id)).toEqual(["c1"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("respects the date range", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const res = await listConversations(db, {
      from: new Date("2026-06-10T00:05:00Z"),
      to: new Date("2026-06-10T00:15:00Z"),
    });
    expect(res.items.map((c) => c.id)).toEqual(["c2"]);
  });
});
