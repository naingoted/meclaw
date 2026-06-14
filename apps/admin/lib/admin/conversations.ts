import { chatMisses, conversations, messages, retrievalEvents } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";

export type Outcome = "answered" | "gap" | "abandoned";

export type ConversationSummary = {
  id: string;
  createdAt: string;
  firstUserPreview: string;
  turnCount: number;
  lastMessageAt: string | null;
  outcome: Outcome;
};

export type ConversationListResult = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export type ListConversationsOpts = {
  from: Date;
  to: Date;
  outcome?: Outcome;
  q?: string;
  cursor?: string | null;
  limit?: number;
};

const STALE_MS = 60 * 60 * 1000; // 1h: a trailing user message older than this = abandoned
const PREVIEW_LEN = 120;

/** Pure outcome classifier — unit-tested in isolation, also reused per-row below. */
export function deriveOutcome(
  input: { hasMiss: boolean; lastRole: string | null; lastMessageAt: Date | null },
  now: number = Date.now(),
): Outcome {
  if (input.hasMiss) return "gap";
  if (
    input.lastRole === "user" &&
    input.lastMessageAt &&
    now - input.lastMessageAt.getTime() > STALE_MS
  ) {
    return "abandoned";
  }
  return "answered";
}

/** Distinct conversationIds whose any message content matches `q` (ILIKE, case-insensitive). */
export async function searchConversationIds(db: Db, q: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ conversationId: messages.conversationId })
    .from(messages)
    .where(ilike(messages.content, `%${q}%`));
  return rows.map((r) => r.conversationId);
}

function decodeCursor(cursor: string): { ts: Date; id: string } | null {
  const i = cursor.lastIndexOf("|");
  if (i < 0) return null;
  const ts = new Date(cursor.slice(0, i));
  if (Number.isNaN(ts.getTime())) return null;
  return { ts, id: cursor.slice(i + 1) };
}

type ConvAgg = {
  turnCount: number;
  firstUserPreview: string;
  lastRole: string | null;
  lastAt: Date | null;
};

/** Aggregate metrics from message rows. */
function aggregateMetrics(
  ids: string[],
  msgs: Array<{ conversationId: string; role: string; content: string; createdAt: Date }>,
): Map<string, ConvAgg> {
  const agg = new Map<string, ConvAgg>();
  for (const id of ids)
    agg.set(id, { turnCount: 0, firstUserPreview: "", lastRole: null, lastAt: null });
  for (const m of msgs) {
    const a = agg.get(m.conversationId);
    if (!a) continue;
    if (m.role === "user") {
      a.turnCount += 1;
      if (!a.firstUserPreview) a.firstUserPreview = m.content.slice(0, PREVIEW_LEN);
    }
    a.lastRole = m.role;
    a.lastAt = m.createdAt;
  }
  return agg;
}

/** Build summaries from aggregated metrics and miss set. */
function buildSummaries(
  page: Array<{ id: string; createdAt: Date }>,
  agg: Map<string, ConvAgg>,
  missSet: Set<string>,
  now: number,
): ConversationSummary[] {
  return page.map((r) => {
    const a = agg.get(r.id)!;
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      firstUserPreview: a.firstUserPreview,
      turnCount: a.turnCount,
      lastMessageAt: a.lastAt ? a.lastAt.toISOString() : null,
      outcome: deriveOutcome(
        { hasMiss: missSet.has(r.id), lastRole: a.lastRole, lastMessageAt: a.lastAt },
        now,
      ),
    };
  });
}

/**
 * Cursor-paginated conversation summaries, newest first. Metrics (turn count,
 * preview, last message, outcome) are computed on-read from `messages` +
 * `chat_misses` — no persisted columns. Two follow-up batch queries (not N+1).
 */
export async function listConversations(
  db: Db,
  opts: ListConversationsOpts,
): Promise<ConversationListResult> {
  const limit = opts.limit ?? 50;

  // q filter narrows the candidate conversation set first (empty q-match => empty page).
  let qIds: string[] | null = null;
  if (opts.q && opts.q.trim()) {
    qIds = await searchConversationIds(db, opts.q.trim());
    if (qIds.length === 0) return { items: [], nextCursor: null };
  }

  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  const where = and(
    gte(conversations.createdAt, opts.from),
    lte(conversations.createdAt, opts.to),
    qIds ? inArray(conversations.id, qIds) : undefined,
    cursor
      ? sql`(${conversations.createdAt}, ${conversations.id}) < (${cursor.ts}, ${cursor.id})`
      : undefined,
  );

  // Fetch one extra row to know whether a next page exists.
  const rows = await db
    .select({ id: conversations.id, createdAt: conversations.createdAt })
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.createdAt), desc(conversations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { items: [], nextCursor: null };

  const ids = page.map((r) => r.id);

  // Batch query 1: all messages for the page (ordered) → derive per-conversation metrics.
  const msgs = await db
    .select({
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  // Batch query 2: which of the page's conversations have a miss.
  const missRows = await db
    .selectDistinct({ conversationId: chatMisses.conversationId })
    .from(chatMisses)
    .where(inArray(chatMisses.conversationId, ids));
  const missSet = new Set(missRows.map((r) => r.conversationId));

  const agg = aggregateMetrics(ids, msgs);
  const now = Date.now();
  let items = buildSummaries(page, agg, missSet, now);

  if (opts.outcome) items = items.filter((c) => c.outcome === opts.outcome);

  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export type MessageRow = { id: string; role: string; content: string; createdAt: string };
export type RetrievalChunkView = { id: string; source: string; score: number; kept: boolean };
export type RetrievalEventView = {
  messageId: string;
  query: string;
  intent: string;
  grounded: boolean;
  stuffed: boolean;
  topScore: number | null;
  answerUsed: boolean;
  chunks: RetrievalChunkView[];
};
export type ConversationDetail = {
  conversation: { id: string; createdAt: string };
  messages: MessageRow[];
  retrieval: Record<string, RetrievalEventView>;
};

/** Full thread (oldest first) + retrieval telemetry keyed by messageId. Null if unknown. */
export async function getConversation(db: Db, id: string): Promise<ConversationDetail | null> {
  const convo = (await db.select().from(conversations).where(eq(conversations.id, id)))[0];
  if (!convo) return null;

  const msgs = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const events = await db
    .select()
    .from(retrievalEvents)
    .where(eq(retrievalEvents.conversationId, id));

  const retrieval: Record<string, RetrievalEventView> = {};
  for (const e of events) {
    retrieval[e.messageId] = {
      messageId: e.messageId,
      query: e.query,
      intent: e.intent,
      grounded: e.grounded,
      stuffed: e.stuffed,
      topScore: e.topScore,
      answerUsed: e.answerUsed,
      chunks: (e.chunks as RetrievalChunkView[]) ?? [],
    };
  }

  return {
    conversation: { id: convo.id, createdAt: convo.createdAt.toISOString() },
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    retrieval,
  };
}

/**
 * Serialize the given conversations to JSONL (one conversation per line) for
 * eval-set building. Unknown ids are silently skipped. Order follows `ids`.
 */
export async function exportConversationsJsonl(db: Db, ids: string[]): Promise<string> {
  const lines: string[] = [];
  for (const id of ids) {
    const detail = await getConversation(db, id);
    if (!detail) continue;
    lines.push(
      JSON.stringify({
        id: detail.conversation.id,
        createdAt: detail.conversation.createdAt,
        messages: detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      }),
    );
  }
  return lines.join("\n");
}
