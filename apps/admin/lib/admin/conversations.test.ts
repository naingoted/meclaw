import { chatMisses, conversations, messages, retrievalEvents } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it } from "vitest";
import {
  conversationStats,
  deriveOutcome,
  exportConversationsJsonl,
  getConversation,
  listConversations,
} from "./conversations";

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

  it("paginates over filtered outcomes instead of returning an empty first page", async () => {
    const { db } = await makeTestDb();
    const base = new Date("2026-06-10T00:00:00.000Z").getTime();
    const at = (mins: number) => new Date(base + mins * 60_000);

    await db.insert(conversations).values([
      { id: "c-gap-newer", createdAt: at(10) },
      { id: "c-answered-newest", createdAt: at(20) },
      { id: "c-gap-older", createdAt: at(0) },
    ]);
    await db.insert(messages).values([
      {
        id: "m-gap-newer-user",
        conversationId: "c-gap-newer",
        role: "user",
        content: "newer gap",
        createdAt: at(10),
      },
      {
        id: "m-gap-newer-assistant",
        conversationId: "c-gap-newer",
        role: "assistant",
        content: "not enough info",
        createdAt: at(11),
      },
      {
        id: "m-answered-user",
        conversationId: "c-answered-newest",
        role: "user",
        content: "latest answered",
        createdAt: at(20),
      },
      {
        id: "m-answered-assistant",
        conversationId: "c-answered-newest",
        role: "assistant",
        content: "answer",
        createdAt: at(21),
      },
      {
        id: "m-gap-older-user",
        conversationId: "c-gap-older",
        role: "user",
        content: "older gap",
        createdAt: at(0),
      },
      {
        id: "m-gap-older-assistant",
        conversationId: "c-gap-older",
        role: "assistant",
        content: "still missing",
        createdAt: at(1),
      },
    ]);
    await db.insert(chatMisses).values([
      {
        id: "00000000-0000-4000-8000-000000000101",
        messageId: "m-gap-newer-assistant",
        conversationId: "c-gap-newer",
        clusterId: "00000000-0000-4000-8000-0000000001aa",
        query: "newer gap",
        reason: "floor",
        topScore: 0.2,
        createdAt: at(11),
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        messageId: "m-gap-older-assistant",
        conversationId: "c-gap-older",
        clusterId: "00000000-0000-4000-8000-0000000001ab",
        query: "older gap",
        reason: "floor",
        topScore: 0.2,
        createdAt: at(1),
      },
    ]);

    const page1 = await listConversations(db, { ...wide, outcome: "gap", limit: 1 });
    expect(page1.items.map((c) => c.id)).toEqual(["c-gap-newer"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listConversations(db, {
      ...wide,
      outcome: "gap",
      limit: 1,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((c) => c.id)).toEqual(["c-gap-older"]);
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

describe("listConversations search (q)", () => {
  const wide = { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-07-01T00:00:00Z") };

  it("returns only conversations whose messages match q (case-insensitive)", async () => {
    const { db } = await makeTestDb();
    await seed(db); // c1 mentions "salary", c2 mentions "rust"
    const res = await listConversations(db, { ...wide, q: "RUST" });
    expect(res.items.map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns an empty page when nothing matches", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const res = await listConversations(db, { ...wide, q: "zzz-no-match" });
    expect(res.items).toEqual([]);
    expect(res.nextCursor).toBeNull();
  });
});

describe("getConversation", () => {
  it("returns null for an unknown id", async () => {
    const { db } = await makeTestDb();
    expect(await getConversation(db, "nope")).toBeNull();
  });

  it("returns the thread (oldest first) and retrieval keyed by messageId", async () => {
    const { db } = await makeTestDb();
    const t = new Date("2026-06-10T00:00:00Z");
    await db.insert(conversations).values({ id: "c9", createdAt: t });
    await db.insert(messages).values([
      {
        id: "u1",
        conversationId: "c9",
        role: "user",
        content: "do you know rust?",
        createdAt: new Date(t.getTime() + 1000),
      },
      {
        id: "a1",
        conversationId: "c9",
        role: "assistant",
        content: "A little.",
        createdAt: new Date(t.getTime() + 2000),
      },
    ]);
    await db.insert(retrievalEvents).values({
      id: "00000000-0000-4000-8000-0000000000ee",
      messageId: "a1",
      conversationId: "c9",
      query: "do you know rust?",
      intent: "knowledge",
      grounded: true,
      stuffed: false,
      topScore: 0.42,
      answerUsed: true,
      chunks: [{ id: "skills:0", source: "skills", score: 0.42, kept: true }],
      createdAt: new Date(t.getTime() + 2000),
    });

    const detail = await getConversation(db, "c9");
    expect(detail?.conversation.id).toBe("c9");
    expect(detail?.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(detail?.retrieval.a1.intent).toBe("knowledge");
    expect(detail?.retrieval.a1.topScore).toBe(0.42);
    expect(detail?.retrieval.a1.chunks[0].source).toBe("skills");
    expect(detail?.retrieval.u1).toBeUndefined(); // no event for the user turn
  });
});

describe("exportConversationsJsonl", () => {
  it("emits one JSON line per conversation with its messages", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const jsonl = await exportConversationsJsonl(db, ["c1", "c2"]);
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    const c1 = parsed.find((p) => p.id === "c1");
    expect(c1.messages).toHaveLength(2); // one user + one assistant
    expect(c1.messages[0]).toMatchObject({ role: "user", content: "what is your salary?" });
  });

  it("skips unknown ids", async () => {
    const { db } = await makeTestDb();
    await seed(db);
    const jsonl = await exportConversationsJsonl(db, ["c1", "ghost"]);
    expect(jsonl.trim().split("\n")).toHaveLength(1);
  });
});

describe("conversationStats", () => {
  it("computes total, gap rate %, and avg turns over the window", async () => {
    const { db } = await makeTestDb();
    await seed(db); // 3 conversations (c1,c2,c3); c2 has a miss; user-turn counts: c1=1,c2=1,c3=1
    const stats = await conversationStats(db, 3650); // wide window covers the seed
    expect(stats.total).toBe(3);
    expect(stats.gapRatePct).toBe(33); // 1 of 3 conversations has a miss → round(33.3)
    expect(stats.avgTurns).toBeCloseTo(1, 1);
  });

  it("returns zeros when there are no conversations", async () => {
    const { db } = await makeTestDb();
    const stats = await conversationStats(db, 7);
    expect(stats).toEqual({ total: 0, gapRatePct: 0, avgTurns: 0 });
  });

  it("counts gap conversations from the same created-at cohort as the total", async () => {
    const { db } = await makeTestDb();
    const now = Date.now();
    const oldCreatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const recentCreatedAt = new Date(now - 2 * 24 * 60 * 60 * 1000);

    await db.insert(conversations).values([
      { id: "c-old-gap", createdAt: oldCreatedAt },
      { id: "c-recent-answered", createdAt: recentCreatedAt },
    ]);
    await db.insert(messages).values([
      {
        id: "m-old-gap-user",
        conversationId: "c-old-gap",
        role: "user",
        content: "old conversation",
        createdAt: oldCreatedAt,
      },
      {
        id: "m-old-gap-assistant",
        conversationId: "c-old-gap",
        role: "assistant",
        content: "old gap response",
        createdAt: new Date(oldCreatedAt.getTime() + 60_000),
      },
      {
        id: "m-recent-user",
        conversationId: "c-recent-answered",
        role: "user",
        content: "recent conversation",
        createdAt: recentCreatedAt,
      },
      {
        id: "m-recent-assistant",
        conversationId: "c-recent-answered",
        role: "assistant",
        content: "recent answer",
        createdAt: new Date(recentCreatedAt.getTime() + 60_000),
      },
    ]);
    await db.insert(chatMisses).values({
      id: "00000000-0000-4000-8000-000000000201",
      messageId: "m-old-gap-assistant",
      conversationId: "c-old-gap",
      clusterId: "00000000-0000-4000-8000-0000000002aa",
      query: "old conversation",
      reason: "floor",
      topScore: 0.1,
      createdAt: new Date(now - 24 * 60 * 60 * 1000),
    });

    const stats = await conversationStats(db, 7);
    expect(stats.total).toBe(1);
    expect(stats.gapRatePct).toBe(0);
    expect(stats.avgTurns).toBe(1);
  });
});
