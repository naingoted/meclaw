import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Database initialization and persistence for echo-clone.
 * Uses better-sqlite3 with programmatic schema creation (no separate migrations).
 *
 * Tables are created on first connection if they don't exist. The DB file lives
 * at `data/echo.db` (gitignored); the `data/` dir is created at runtime if absent.
 *
 * Note: better-sqlite3 requires a native module build. In development environments
 * where the module isn't compiled, DB initialization will fail gracefully (best-effort).
 * The chat functionality continues to work; only persistence is affected.
 */

const DB_DIR = "data";
const DEFAULT_DB_PATH = join(process.cwd(), DB_DIR, "echo.db");

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
 * @param dbPath - Optional override path; defaults to `data/echo.db`
 * @returns A better-sqlite3 Database instance
 */
export async function initDb(dbPath: string = DEFAULT_DB_PATH): Promise<Database.Database> {
  // Ensure the data directory exists
  const dir = dirname(dbPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist; ignore
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Create tables if they don't exist
  db.exec(`
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

  return db;
}

/**
 * Save a turn (user messages + assistant response) to the database.
 * Best-effort: returns the conversation ID on success.
 *
 * Creates a new conversation if one doesn't exist, then persists all user
 * messages (in order) followed by the single assistant message.
 *
 * @param db - The database instance (from initDb)
 * @param userMessages - Array of user messages to save before the assistant response
 * @param assistantMessage - The assistant response message
 * @returns The conversation ID (unique identifier for this chat thread)
 */
export async function saveTurn(
  db: Database.Database,
  userMessages: PersistentMessage[],
  assistantMessage: PersistentMessage
): Promise<string> {
  try {
    const conversationId = randomUUID();
    const now = Date.now();

    // Use a transaction to ensure atomic writes
    const insert = db.transaction(() => {
      // Insert the conversation
      db.prepare(
        "INSERT INTO conversations (id, createdAt) VALUES (?, ?)"
      ).run(conversationId, now);

      // Insert user messages in order
      for (const msg of userMessages) {
        db.prepare(
          "INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)"
        ).run(randomUUID(), conversationId, msg.role, msg.content, now);
      }

      // Insert assistant message
      db.prepare(
        "INSERT INTO messages (id, conversationId, role, content, toolCalls, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        randomUUID(),
        conversationId,
        assistantMessage.role,
        assistantMessage.content,
        assistantMessage.toolCalls || null,
        now
      );
    });

    insert();
    return conversationId;
  } catch (error) {
    throw error;
  }
}
