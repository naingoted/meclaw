import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { parseDbEnv } from "./env";
import * as schema from "./schema";

/**
 * Database connection + persistence for meclaw (Postgres via postgres-js).
 * Provider-agnostic surface: saveTurn() is unchanged; only the driver differs.
 *
 * The pool is opened once per process from DATABASE_URL. Schema is owned by
 * Drizzle migrations (see lib/db/migrate.ts) — this module does NOT create
 * tables. Run `pnpm db:migrate` before serving.
 */

/** A message as persisted (toolCalls is a JSON string on the wire). */
export type PersistentMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: string; // JSON string of tool calls
};

let client: ReturnType<typeof postgres> | null = null;

/**
 * Open (once) a Postgres connection pool and return a Drizzle instance.
 * @param databaseUrl - Optional override; defaults to the parsed DATABASE_URL.
 */
export async function initDb(databaseUrl?: string) {
  if (!client) {
    const url = databaseUrl ?? parseDbEnv().DATABASE_URL;
    client = postgres(url, { max: 10 });
  }
  return drizzle(client, { schema });
}

/**
 * Save a turn (latest user message + assistant response). Best-effort caller
 * contract preserved: persists ONLY the last user message (avoids duplicating
 * client-sent history) plus the assistant response. Returns the conversation ID.
 *
 * Accepts an optional stable conversationId (default = randomUUID()) to enable
 * multi-turn sessions: calling with the same id across turns upserts instead of
 * failing on re-insert. Accepts an optional assistantMessageId (default =
 * randomUUID()) for the assistant row id, enabling caller-supplied idempotency
 * keys (e.g., the chat flush can reuse the same id for miss logging).
 */
export async function saveTurn(
  db: Awaited<ReturnType<typeof initDb>>,
  userMessages: PersistentMessage[],
  assistantMessage: PersistentMessage,
  conversationId: string = randomUUID(),
  assistantMessageId: string = randomUUID(),
): Promise<string> {
  const now = new Date();

  await db.transaction(async (tx) => {
    // Upsert: the same session id spans many turns, so don't fail on re-insert.
    await tx
      .insert(schema.conversations)
      .values({
        id: conversationId,
        createdAt: now,
      })
      .onConflictDoNothing();

    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      await tx.insert(schema.messages).values({
        id: randomUUID(),
        conversationId,
        role: lastUserMessage.role,
        content: lastUserMessage.content,
        createdAt: now,
      });
    }

    await tx.insert(schema.messages).values({
      id: assistantMessageId,
      conversationId,
      role: assistantMessage.role,
      content: assistantMessage.content,
      toolCalls: assistantMessage.toolCalls ? JSON.parse(assistantMessage.toolCalls) : null,
      createdAt: now,
    });
  });

  return conversationId;
}

/** A captured lead. At least one of email/phone must be present. */
export type LeadInput = {
  conversationId: string;
  email?: string;
  phone?: string;
  triggerQuestion?: string;
  trigger: string;
};

/**
 * Persist a captured lead. Best-effort dedup: skips insertion when the same
 * conversation already holds a row with the same email or phone.
 */
export async function saveLead(
  db: Awaited<ReturnType<typeof initDb>>,
  lead: LeadInput,
): Promise<void> {
  // and()/or() ignore undefined conditions, so an absent email/phone is dropped.
  const existing = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.conversationId, lead.conversationId),
        or(
          lead.email ? eq(schema.leads.email, lead.email) : undefined,
          lead.phone ? eq(schema.leads.phone, lead.phone) : undefined,
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(schema.leads).values({
    id: randomUUID(),
    conversationId: lead.conversationId,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    triggerQuestion: lead.triggerQuestion ?? null,
    trigger: lead.trigger,
    createdAt: new Date(),
  });
}

/** A captured RAG miss (one missed message). */
export type MissInput = {
  messageId: string;
  conversationId: string;
  clusterId: string;
  query: string;
  reason: "floor" | "fallback" | "clarify" | "answer_gap";
  topScore: number | null;
};

/**
 * Persist a missed message. Idempotent on messageId (unique index): a flush
 * retry with the same assistant message id is a no-op. Best-effort caller
 * contract (the chat route swallows failures).
 */
export async function saveMiss(
  db: Awaited<ReturnType<typeof initDb>>,
  miss: MissInput,
): Promise<void> {
  await db
    .insert(schema.chatMisses)
    .values({
      id: randomUUID(),
      messageId: miss.messageId,
      conversationId: miss.conversationId,
      clusterId: miss.clusterId,
      query: miss.query,
      reason: miss.reason,
      topScore: miss.topScore,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.chatMisses.messageId })
    .execute();
}

/** A single retrieval candidate as persisted in retrieval_events.chunks. */
export type RetrievalChunk = {
  id: string;
  source: string;
  score: number;
  kept: boolean;
};

export type RetrievalEventInput = {
  messageId: string;
  conversationId: string;
  query: string;
  intent: string;
  grounded: boolean;
  stuffed: boolean;
  topScore: number | null;
  answerUsed: boolean;
  chunks: RetrievalChunk[];
};

/**
 * Persist a knowledge-route retrieval event (hit or miss). Idempotent on
 * messageId (unique index): a flush retry is a no-op. Best-effort caller
 * contract — the chat route swallows failures.
 */
export async function saveRetrievalEvent(
  db: Awaited<ReturnType<typeof initDb>>,
  event: RetrievalEventInput,
): Promise<void> {
  await db
    .insert(schema.retrievalEvents)
    .values({
      id: randomUUID(),
      messageId: event.messageId,
      conversationId: event.conversationId,
      query: event.query,
      intent: event.intent,
      grounded: event.grounded,
      stuffed: event.stuffed,
      topScore: event.topScore,
      answerUsed: event.answerUsed,
      chunks: event.chunks,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.retrievalEvents.messageId })
    .execute();
}

export type ConversationMessageRow = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: Date;
};

/**
 * Read the most recent `limit` messages for a conversation, oldest-first.
 * Used by the widget's resume-hydration path (`GET /api/chat/history`).
 * Returns [] for an unknown conversationId (no throw).
 */
export async function listConversationMessages(
  db: Awaited<ReturnType<typeof initDb>>,
  conversationId: string,
  limit: number,
): Promise<ConversationMessageRow[]> {
  // Raw SQL query to ensure proper ordering: oldest first, user before assistant within same timestamp
  // Uses LIMIT with subquery to get the most recent N messages
  const result = await db.execute(sql`
    SELECT id, role, content, "createdAt"
    FROM (
      SELECT id, role, content, "createdAt"
      FROM messages
      WHERE "conversationId" = ${conversationId}
      ORDER BY "createdAt" desc, case when role = 'user' then 0 else 1 end, id desc
      LIMIT ${limit}
    ) sub
    ORDER BY "createdAt" asc, case when role = 'user' then 0 else 1 end, id asc
  `);

  // postgres-js returns the row array directly; PGlite wraps it in { rows }.
  type Row = { id: string; role: string; content: string; createdAt: Date };
  const rows = Array.isArray(result)
    ? (result as unknown as Row[])
    : (result as unknown as { rows: Row[] }).rows;

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "tool",
    content: r.content,
    createdAt: r.createdAt,
  }));
}
