import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { documents } from "@/lib/db/schema";
import { contentHash } from "./hash";
import { logAudit } from "./audit";

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInput = { title: string; body: string; category?: string };

/** Derived, not stored: never-ingested, or edited since the last successful ingest. */
export function isDirty(doc: Pick<DocumentRow, "updatedAt" | "lastIngestedAt">): boolean {
  if (!doc.lastIngestedAt) return true;
  return doc.updatedAt.getTime() > doc.lastIngestedAt.getTime();
}

export async function listDocuments(db: any): Promise<DocumentRow[]> {
  return db.select().from(documents).orderBy(desc(documents.updatedAt));
}

export async function getDocument(db: any, id: string): Promise<DocumentRow | undefined> {
  const rows = await db.select().from(documents).where(eq(documents.id, id));
  return rows[0];
}

export async function createDocument(db: any, input: DocumentInput, actorIp: string): Promise<DocumentRow> {
  const now = new Date();
  const row = {
    id: randomUUID(), title: input.title, body: input.body,
    kind: "markdown" as const, category: input.category ?? null, status: "draft" as const,
    contentHash: contentHash(input.body), createdAt: now, updatedAt: now, lastIngestedAt: null,
  };
  await db.insert(documents).values(row).execute();
  await logAudit(db, { action: "document.create", entityType: "document", entityId: row.id, summary: `created "${input.title}"`, actorIp });
  return row as DocumentRow;
}

export async function updateDocument(db: any, id: string, input: DocumentInput, actorIp: string): Promise<DocumentRow> {
  const patch = { title: input.title, body: input.body, category: input.category ?? null, contentHash: contentHash(input.body), updatedAt: new Date() };
  await db.update(documents).set(patch).where(eq(documents.id, id)).execute();
  await logAudit(db, { action: "document.update", entityType: "document", entityId: id, summary: `edited "${input.title}"`, actorIp });
  return (await getDocument(db, id))!;
}

export async function deleteDocument(db: any, id: string, actorIp: string): Promise<void> {
  const existing = await getDocument(db, id);
  await db.delete(documents).where(eq(documents.id, id)).execute();
  await logAudit(db, { action: "document.delete", entityType: "document", entityId: id, summary: `deleted "${existing?.title ?? id}"`, actorIp });
}
