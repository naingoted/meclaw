import { drizzle } from "drizzle-orm/postgres-js";
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
 */
export async function saveTurn(
  db: Awaited<ReturnType<typeof initDb>>,
  userMessages: PersistentMessage[],
  assistantMessage: PersistentMessage,
): Promise<string> {
  const conversationId = randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.conversations).values({
      id: conversationId,
      createdAt: now,
    });

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
      id: randomUUID(),
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
