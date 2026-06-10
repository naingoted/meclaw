import { randomUUID } from "node:crypto";
import { documents, gapClusters } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { logAudit } from "@meclaw/core/settings";
import { and, desc, eq } from "drizzle-orm";
import { contentHash } from "./hash";

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentOrigin = DocumentRow["origin"]; // "manual" | "seed" | "gap"
export type DocumentInput = {
  title: string;
  body: string;
  category?: string;
  origin?: DocumentOrigin;
};

/** Derived, not stored: never-ingested, or edited since the last successful ingest. */
export function isDirty(doc: Pick<DocumentRow, "updatedAt" | "lastIngestedAt">): boolean {
  if (!doc.lastIngestedAt) return true;
  return doc.updatedAt.getTime() > doc.lastIngestedAt.getTime();
}

export async function listDocuments(db: Db, origin?: DocumentOrigin): Promise<DocumentRow[]> {
  const q = db.select().from(documents);
  const rows = origin
    ? await q.where(eq(documents.origin, origin)).orderBy(desc(documents.updatedAt))
    : await q.orderBy(desc(documents.updatedAt));
  return rows;
}

export async function getDocument(db: Db, id: string): Promise<DocumentRow | undefined> {
  const rows = await db.select().from(documents).where(eq(documents.id, id));
  return rows[0];
}

export async function createDocument(
  db: Db,
  input: DocumentInput,
  actorIp: string,
): Promise<DocumentRow> {
  const now = new Date();
  const row = {
    id: randomUUID(),
    title: input.title,
    body: input.body,
    kind: "markdown" as const,
    category: input.category ?? null,
    origin: input.origin ?? ("manual" as const),
    status: "draft" as const,
    contentHash: contentHash(input.body),
    createdAt: now,
    updatedAt: now,
    lastIngestedAt: null,
  };
  await db.insert(documents).values(row).execute();
  await logAudit(db, {
    action: "document.create",
    entityType: "document",
    entityId: row.id,
    summary: `created "${input.title}"`,
    actorIp,
  });
  return row as DocumentRow;
}

export async function updateDocument(
  db: Db,
  id: string,
  input: DocumentInput,
  actorIp: string,
): Promise<DocumentRow> {
  const patch = {
    title: input.title,
    body: input.body,
    category: input.category ?? null,
    contentHash: contentHash(input.body),
    updatedAt: new Date(),
  };
  await db.update(documents).set(patch).where(eq(documents.id, id)).execute();
  await logAudit(db, {
    action: "document.update",
    entityType: "document",
    entityId: id,
    summary: `edited "${input.title}"`,
    actorIp,
  });
  return (await getDocument(db, id))!;
}

export async function deleteDocument(db: Db, id: string, actorIp: string): Promise<void> {
  const existing = await getDocument(db, id);
  // A resolved gap cluster pointing at this document would dangle (the chat's
  // resolved-gap fast path treats it as no-match) — flip it back to 'new' so
  // the owner can re-answer it from /admin/gaps.
  await db
    .update(gapClusters)
    .set({ status: "new", resolvedDocumentId: null, resolvedAt: null, updatedAt: new Date() })
    .where(and(eq(gapClusters.resolvedDocumentId, id), eq(gapClusters.status, "resolved")))
    .execute();
  await db.delete(documents).where(eq(documents.id, id)).execute();
  await logAudit(db, {
    action: "document.delete",
    entityType: "document",
    entityId: id,
    summary: `deleted "${existing?.title ?? id}"`,
    actorIp,
  });
}
