import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Database schema for echo-clone persistence.
 * Tables created programmatically on first connection (no separate migration step).
 */

export const conversations = sqliteTable("conversations", {
  /** Unique conversation ID (UUID v4) */
  id: text("id").primaryKey(),
  /** ISO 8601 timestamp when the conversation started */
  createdAt: integer("createdAt").notNull(),
  /** Optional visitor metadata as JSON (future: browser fingerprint, locale, etc.) */
  visitorMeta: text("visitorMeta"), // JSON-serialized
});

export const messages = sqliteTable("messages", {
  /** Unique message ID (UUID v4) */
  id: text("id").primaryKey(),
  /** Foreign key to conversations.id */
  conversationId: text("conversationId").notNull(),
  /** Role: 'user', 'assistant', or 'tool' */
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  /** Message content (markdown if assistant, plain text if user) */
  content: text("content").notNull(),
  /** Optional array of tool calls (JSON-serialized, only for assistant messages) */
  toolCalls: text("toolCalls"), // JSON-serialized
  /** ISO 8601 timestamp when the message was created */
  createdAt: integer("createdAt").notNull(),
});
