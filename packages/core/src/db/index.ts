import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, or } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import * as schema from "./schema";
import { parseDbEnv } from "./env";

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
      toolCalls: assistantMessage.toolCalls
        ? JSON.parse(assistantMessage.toolCalls)
        : null,
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
