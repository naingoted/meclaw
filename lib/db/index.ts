import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as schema from "./schema";

/**
 * Database initialization and persistence for meclaw.
 * Uses better-sqlite3 with Drizzle ORM for type-safe queries.
 *
 * Tables are created on first connection if they don't exist. The DB file lives
 * at `data/meclaw.db` (gitignored); the `data/` dir is created at runtime if absent.
 *
 * Note: better-sqlite3 requires a native module build. In development environments
 * where the module isn't compiled, DB initialization will fail gracefully (best-effort).
 * The chat functionality continues to work; only persistence is affected.
 */

const DB_DIR = "data";
const DEFAULT_DB_PATH = join(process.cwd(), DB_DIR, "meclaw.db");

/**
 * Represents a message as persisted (before sending to AI SDK).
 * The AI SDK will handle the rest of the transformation.
 */
export type PersistentMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: string; // JSON string of tool calls
};

/**
 * Initialize the database: create the connection, ensure the data dir exists,
 * and create tables if they don't exist.
 *
 * @param dbPath - Optional override path; defaults to `data/meclaw.db`
 * @returns A Drizzle ORM database instance
 */
export async function initDb(dbPath: string = DEFAULT_DB_PATH) {
  // Ensure the data directory exists
  const dir = dirname(dbPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist; ignore
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  // Create tables if they don't exist (programmatic, no migration files)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL,
      visitorMeta TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      toolCalls TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversationId
      ON messages(conversationId);
  `);

  return drizzle(sqlite, { schema });
}

/**
 * Save a turn (latest user message + assistant response) to the database.
 * Best-effort: returns the conversation ID on success.
 *
 * Creates a new conversation and persists ONLY the LAST user message
 * (to avoid duplicating prior messages on each turn) followed by the
 * assistant response. The userMessages array may contain prior history
 * from the client, but we persist only the newest turn.
 *
 * @param db - The Drizzle ORM database instance (from initDb)
 * @param userMessages - Array of user messages; only the last one is persisted
 * @param assistantMessage - The assistant response message
 * @returns The conversation ID (unique identifier for this chat thread)
 */
export async function saveTurn(
  db: Awaited<ReturnType<typeof initDb>>,
  userMessages: PersistentMessage[],
  assistantMessage: PersistentMessage
): Promise<string> {
  const conversationId = randomUUID();
  const now = Date.now();

  // Note: better-sqlite3 transactions are synchronous but wrapped in async for API consistency
  db.transaction(() => {
    // Insert the conversation
    db.insert(schema.conversations).values({
      id: conversationId,
      createdAt: now,
    }).execute();

    // Insert ONLY the last user message (avoid duplicates on repeated POSTs)
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      db.insert(schema.messages).values({
        id: randomUUID(),
        conversationId,
        role: lastUserMessage.role,
        content: lastUserMessage.content,
        createdAt: now,
      }).execute();
    }

    // Insert assistant message
    db.insert(schema.messages).values({
      id: randomUUID(),
      conversationId,
      role: assistantMessage.role,
      content: assistantMessage.content,
      toolCalls: assistantMessage.toolCalls || null,
      createdAt: now,
    }).execute();
  });

  return conversationId;
}
