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

async function loadConversationSummaries(
  db: Db,
  rows: Array<{ id: string; createdAt: Date }>,
  now: number,
): Promise<ConversationSummary[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

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

  const missRows = await db
    .selectDistinct({ conversationId: chatMisses.conversationId })
    .from(chatMisses)
    .where(inArray(chatMisses.conversationId, ids));
  const missSet = new Set(missRows.map((r) => r.conversationId));

  const agg = aggregateMetrics(ids, msgs);
  return buildSummaries(rows, agg, missSet, now);
}

type Cursor = { ts: Date; id: string };

/** Shared candidate-set predicate: time window + optional q-match + optional cursor. */
function conversationWhere(
  opts: ListConversationsOpts,
  qIds: string[] | null,
  cursor: Cursor | null,
) {
  return and(
    gte(conversations.createdAt, opts.from),
    lte(conversations.createdAt, opts.to),
    qIds ? inArray(conversations.id, qIds) : undefined,
    cursor
      ? sql`(${conversations.createdAt}, ${conversations.id}) < (${cursor.ts}, ${cursor.id})`
      : undefined,
  );
}

/** Unfiltered page: one windowed query (+1 row to detect a next page). */
async function listUnfiltered(
  db: Db,
  opts: ListConversationsOpts,
  qIds: string[] | null,
  cursor: Cursor | null,
  limit: number,
  now: number,
): Promise<ConversationListResult> {
  const rows = await db
    .select({ id: conversations.id, createdAt: conversations.createdAt })
    .from(conversations)
    .where(conversationWhere(opts, qIds, cursor))
    .orderBy(desc(conversations.createdAt), desc(conversations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { items: [], nextCursor: null };

  const items = await loadConversationSummaries(db, page, now);
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

/** Rows + their index-aligned summaries, filtered to a target outcome. */
function matchesForOutcome(
  rows: Array<{ id: string; createdAt: Date }>,
  summaries: ConversationSummary[],
  outcome: Outcome,
): { rows: Array<{ id: string; createdAt: Date }>; items: ConversationSummary[] } {
  const rowsOut: Array<{ id: string; createdAt: Date }> = [];
  const itemsOut: ConversationSummary[] = [];
  for (const [index, item] of summaries.entries()) {
    if (item.outcome !== outcome) continue;
    rowsOut.push(rows[index]!);
    itemsOut.push(item);
  }
  return { rows: rowsOut, items: itemsOut };
}

/** Trim accumulated matches to one page and derive the next cursor. */
function buildOutcomePage(
  matchedRows: Array<{ id: string; createdAt: Date }>,
  matchedItems: ConversationSummary[],
  limit: number,
): ConversationListResult {
  if (matchedItems.length === 0) return { items: [], nextCursor: null };
  const items = matchedItems.slice(0, limit);
  const hasMore = matchedItems.length > limit;
  const last = matchedRows[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

/**
 * Outcome is derived on-read, so it can't be a SQL predicate: batch-scan raw
 * pages and keep matching rows until a full page (+1) accumulates or the
 * candidate set is exhausted. Cursor advances by the last raw row scanned.
 */
async function listByOutcome(
  db: Db,
  opts: ListConversationsOpts,
  qIds: string[] | null,
  cursor: Cursor | null,
  limit: number,
  now: number,
): Promise<ConversationListResult> {
  const rawBatchSize = Math.max(limit + 1, 50);
  let scanCursor = cursor;
  const matchedRows: Array<{ id: string; createdAt: Date }> = [];
  const matchedItems: ConversationSummary[] = [];

  while (matchedItems.length < limit + 1) {
    const rows = await db
      .select({ id: conversations.id, createdAt: conversations.createdAt })
      .from(conversations)
      .where(conversationWhere(opts, qIds, scanCursor))
      .orderBy(desc(conversations.createdAt), desc(conversations.id))
      .limit(rawBatchSize);

    if (rows.length === 0) break;

    const summaries = await loadConversationSummaries(db, rows, now);
    const matched = matchesForOutcome(rows, summaries, opts.outcome!);
    matchedRows.push(...matched.rows);
    matchedItems.push(...matched.items);

    if (rows.length < rawBatchSize) break;
    const lastRow = rows[rows.length - 1]!;
    scanCursor = { ts: lastRow.createdAt, id: lastRow.id };
  }

  return buildOutcomePage(matchedRows, matchedItems, limit);
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
  const now = Date.now();

  // q filter narrows the candidate conversation set first (empty q-match => empty page).
  let qIds: string[] | null = null;
  if (opts.q?.trim()) {
    qIds = await searchConversationIds(db, opts.q.trim());
    if (qIds.length === 0) return { items: [], nextCursor: null };
  }

  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

  return opts.outcome
    ? listByOutcome(db, opts, qIds, cursor, limit, now)
    : listUnfiltered(db, opts, qIds, cursor, limit, now);
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

export type ConversationStats = { total: number; gapRatePct: number; avgTurns: number };

/**
 * Lightweight aggregate stats over the last `sinceDays`. Three small COUNT
 * queries — no materialized view. `gapRatePct` = conversations with >=1 miss
 * over total; `avgTurns` = mean user-message count per conversation.
 */
export async function conversationStats(db: Db, sinceDays = 7): Promise<ConversationStats> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(conversations)
    .where(gte(conversations.createdAt, since));

  if (total === 0) return { total: 0, gapRatePct: 0, avgTurns: 0 };

  const [{ gapConvos }] = await db
    .select({ gapConvos: sql<number>`count(distinct ${chatMisses.conversationId})::int` })
    .from(chatMisses)
    .innerJoin(conversations, eq(chatMisses.conversationId, conversations.id))
    .where(gte(conversations.createdAt, since));

  const [{ userTurns }] = await db
    .select({ userTurns: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.role, "user"), gte(conversations.createdAt, since)));

  return {
    total,
    gapRatePct: Math.round((gapConvos / total) * 100),
    avgTurns: Math.round((userTurns / total) * 10) / 10,
  };
}
