import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * In-memory Postgres (PGlite) + Drizzle for hermetic tests. Each call is a
 * fresh, isolated database. Applies the schema with raw DDL that mirrors
 * `schema.ts` (kept in sync by hand — these are small, stable tables). The
 * pgvector extension is loaded so `rag_chunks.embedding vector(768)` mirrors
 * prod; admin tests never run vector search, so the hnsw index is omitted.
 */
export async function makeTestDb() {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS vector;
  `);
  await db.execute(sql`
    CREATE TABLE conversations (
      id text PRIMARY KEY,
      "createdAt" timestamptz NOT NULL,
      "visitorMeta" jsonb
    );
  `);
  await db.execute(sql`
    CREATE TABLE messages (
      id text PRIMARY KEY,
      "conversationId" text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      "toolCalls" jsonb,
      "createdAt" timestamptz NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE documents (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      body text NOT NULL,
      kind text NOT NULL DEFAULT 'markdown',
      category text,
      origin text NOT NULL DEFAULT 'manual',
      status text NOT NULL DEFAULT 'draft',
      "contentHash" text NOT NULL,
      "createdAt" timestamptz NOT NULL,
      "updatedAt" timestamptz NOT NULL,
      "lastIngestedAt" timestamptz
    );
  `);
  await db.execute(sql`
    CREATE TABLE ingestion_jobs (
      id uuid PRIMARY KEY,
      "documentId" uuid,
      kind text NOT NULL,
      status text NOT NULL,
      error text,
      "chunksWritten" integer,
      "createdAt" timestamptz NOT NULL,
      "startedAt" timestamptz,
      "finishedAt" timestamptz
    );
  `);
  await db.execute(sql`
    CREATE TABLE settings (
      id integer PRIMARY KEY DEFAULT 1,
      agents jsonb NOT NULL,
      shared jsonb NOT NULL,
      rag jsonb NOT NULL,
      "public" jsonb NOT NULL,
      "updatedAt" timestamptz NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE audit_log (
      id uuid PRIMARY KEY,
      ts timestamptz NOT NULL,
      action text NOT NULL,
      "entityType" text NOT NULL,
      "entityId" text,
      summary text NOT NULL,
      meta jsonb,
      "actorIp" text
    );
  `);
  await db.execute(sql`
    CREATE TABLE rag_chunks (
      id text PRIMARY KEY,
      source text NOT NULL,
      title text NOT NULL,
      text text NOT NULL,
      ordinal integer NOT NULL,
      embedding vector(768) NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX idx_rag_chunks_source ON rag_chunks (source);
  `);
  await db.execute(sql`
    CREATE TABLE leads (
      id text PRIMARY KEY,
      "conversationId" text NOT NULL,
      email text,
      phone text,
      "triggerQuestion" text,
      trigger text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT leads_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
    );
  `);
  await db.execute(sql`
    CREATE INDEX "idx_leads_conversationId" ON leads ("conversationId");
  `);
  await db.execute(sql`
    CREATE TABLE gap_clusters (
      id uuid PRIMARY KEY,
      label text,
      centroid vector(768) NOT NULL,
      count integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'new',
      "exemplarQuery" text,
      "resolvedDocumentId" uuid,
      "resolvedAt" timestamptz,
      "createdAt" timestamptz NOT NULL,
      "updatedAt" timestamptz NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE chat_misses (
      id uuid PRIMARY KEY,
      "messageId" text NOT NULL,
      "conversationId" text NOT NULL,
      "clusterId" uuid NOT NULL,
      query text NOT NULL,
      reason text NOT NULL,
      "topScore" double precision,
      "createdAt" timestamptz NOT NULL
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX uq_chat_misses_messageId ON chat_misses ("messageId");`);
  await db.execute(sql`CREATE INDEX idx_chat_misses_clusterId ON chat_misses ("clusterId");`);
  await db.execute(sql`
    CREATE TABLE retrieval_events (
      id uuid PRIMARY KEY,
      "messageId" text NOT NULL,
      "conversationId" text NOT NULL,
      query text NOT NULL,
      intent text NOT NULL,
      grounded boolean NOT NULL,
      stuffed boolean NOT NULL,
      "topScore" double precision,
      "answerUsed" boolean NOT NULL,
      chunks jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX uq_retrieval_events_messageId ON retrieval_events ("messageId");`);
  return { db, client };
}
