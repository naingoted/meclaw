import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, integer, index, check, vector, uuid, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

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

export const leads = pgTable(
  "leads",
  {
    /** Unique lead ID (UUID v4, app-generated) */
    id: text("id").primaryKey(),
    /** Stable session id — references conversations.id (no FK, matches schema style) */
    conversationId: text("conversationId").notNull(),
    /** Visitor email (at least one of email/phone is present) */
    email: text("email"),
    /** Visitor phone (kept as supplied) */
    phone: text("phone"),
    /** The user question that triggered the capture offer */
    triggerQuestion: text("triggerQuestion"),
    /** Which offer the visitor responded to: provided|edge_case|connect_intent|repeated_dead_end */
    trigger: text("trigger").notNull(),
    /** When the lead was captured */
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "leads_contact_check",
      sql`${table.email} is not null or ${table.phone} is not null`,
    ),
    index("idx_leads_conversationId").on(table.conversationId),
  ],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // seam: future multimodal kinds (pdf/image/…) extend this; v1 only writes 'markdown'.
  kind: text("kind").notNull().default("markdown"),
  category: text("category"),
  // Lifecycle origin: 'manual' (Documents page / legacy), 'seed' (content import),
  // 'gap' (created by answering a gap cluster). Type-only enum → plain text + default in SQL.
  origin: text("origin", { enum: ["manual", "seed", "gap"] }).notNull().default("manual"),
  status: text("status", { enum: ["draft", "ready", "error"] }).notNull().default("draft"),
  contentHash: text("contentHash").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  lastIngestedAt: timestamp("lastIngestedAt", { withTimezone: true }),
});

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: uuid("id").primaryKey(),
  documentId: uuid("documentId"),
  kind: text("kind", { enum: ["single", "all"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull(),
  error: text("error"),
  chunksWritten: integer("chunksWritten"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  startedAt: timestamp("startedAt", { withTimezone: true }),
  finishedAt: timestamp("finishedAt", { withTimezone: true }),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  agents: jsonb("agents").notNull(),   // Record<agentKey, AgentConfig> — extensible map
  shared: jsonb("shared").notNull(),   // { persona }
  rag: jsonb("rag").notNull(),
  public: jsonb("public").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId"),
  summary: text("summary").notNull(),
  meta: jsonb("meta"),
  actorIp: text("actorIp"),
});

/**
 * RAG gap clusters — observability, NOT corpus. The Python router writes the
 * capture columns (centroid/count/exemplarQuery) on miss detection; the Next
 * admin writes the resolution columns (status/resolvedDocumentId/resolvedAt).
 * Disjoint columns → safe at single-user concurrency. No hard FKs (schema style).
 */
export const gapClusters = pgTable(
  "gap_clusters",
  {
    id: uuid("id").primaryKey(),
    /** phase-2 LLM topic label; null = unlabeled */
    label: text("label"),
    /** running centroid of member miss embeddings */
    centroid: vector("centroid", { dimensions: 768 }).notNull(),
    count: integer("count").notNull().default(0),
    status: text("status", { enum: ["new", "resolved", "ignored"] }).notNull().default("new"),
    /** representative query (first miss) */
    exemplarQuery: text("exemplarQuery"),
    /** link to documents.id (no hard FK, matches schema style) */
    resolvedDocumentId: uuid("resolvedDocumentId"),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_gap_clusters_centroid").using("hnsw", t.centroid.op("vector_cosine_ops")),
    index("idx_gap_clusters_status").on(t.status),
    index("idx_gap_clusters_count").on(t.count),
  ],
);

/**
 * One row per missed message. Written by the Next /api/chat flush (it owns the
 * assistant messageId). Keyed uniquely by messageId so a flush retry is idempotent.
 */
export const chatMisses = pgTable(
  "chat_misses",
  {
    id: uuid("id").primaryKey(),
    /** references messages.id (no hard FK); unique per miss */
    messageId: text("messageId").notNull(),
    conversationId: text("conversationId").notNull(),
    /** references gap_clusters.id */
    clusterId: uuid("clusterId").notNull(),
    query: text("query").notNull(),
    reason: text("reason", { enum: ["floor", "fallback", "clarify", "answer_gap"] }).notNull(),
    /** null when fallback (0 chunks) or clarify */
    topScore: doublePrecision("topScore"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("uq_chat_misses_messageId").on(t.messageId),
    index("idx_chat_misses_clusterId").on(t.clusterId),
    index("idx_chat_misses_conversationId").on(t.conversationId),
    index("idx_chat_misses_createdAt").on(t.createdAt),
  ],
);
