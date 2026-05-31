import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, integer, index, check, vector } from "drizzle-orm/pg-core";

/**
 * Database schema for meclaw persistence (Postgres).
 * Table + field names match the prior SQLite schema so the persistence
 * contract (saveTurn) is unchanged; only the column types move to Postgres.
 */

export const conversations = pgTable("conversations", {
  /** Unique conversation ID (UUID v4, app-generated) */
  id: text("id").primaryKey(),
  /** When the conversation started */
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Optional visitor metadata (future: locale, fingerprint, etc.) */
  visitorMeta: jsonb("visitorMeta"),
});

export const messages = pgTable(
  "messages",
  {
    /** Unique message ID (UUID v4, app-generated) */
    id: text("id").primaryKey(),
    /** References conversations.id (no FK constraint — matches prior schema) */
    conversationId: text("conversationId").notNull(),
    /** Role: 'user', 'assistant', or 'tool' */
    role: text("role").notNull(),
    /** Message content (markdown if assistant, plain text if user) */
    content: text("content").notNull(),
    /** Optional tool calls (only for assistant messages) */
    toolCalls: jsonb("toolCalls"),
    /** When the message was created */
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "messages_role_check",
      sql`${table.role} in ('user', 'assistant', 'tool')`,
    ),
    index("idx_messages_conversationId").on(table.conversationId),
  ],
);

/**
 * RAG knowledge chunks (pgvector). Written by `pnpm ingest`, read by the Python
 * sidecar's retriever. Replaces the prior Qdrant collection; same fields.
 */
export const ragChunks = pgTable(
  "rag_chunks",
  {
    /** Chunk id, "<slug>:<ordinal>" (e.g. "about:0") — app-generated */
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    ordinal: integer("ordinal").notNull(),
    /** nomic-embed-text dimension */
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
  },
  (t) => [
    index("idx_rag_chunks_source").on(t.source),
    index("idx_rag_chunks_embedding").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);
