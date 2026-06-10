import { randomUUID } from "node:crypto";
import { chatMisses, documents, gapClusters, ingestionJobs } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { logAudit } from "@meclaw/core/settings";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { contentHash } from "./hash";

export type GapClusterRow = typeof gapClusters.$inferSelect;
export type ChatMissRow = typeof chatMisses.$inferSelect;

export type GapClusterSummary = {
  id: string;
  exemplarQuery: string | null;
  count: number;
  status: string;
  updatedAt: string;
  /** reason -> count across member misses (e.g. { floor: 3, fallback: 1 }) */
  reasons: Record<string, number>;
};

/** Clusters in a given status, ranked by hit count desc, with reason mix. */
export async function listClusters(db: Db, status = "new"): Promise<GapClusterSummary[]> {
  const clusters = await db
    .select()
    .from(gapClusters)
    .where(eq(gapClusters.status, status as GapClusterRow["status"]))
    .orderBy(desc(gapClusters.count));
  if (clusters.length === 0) return [];

  const ids = clusters.map((c) => c.id);
  const reasonRows = await db
    .select({
      clusterId: chatMisses.clusterId,
      reason: chatMisses.reason,
      n: sql<number>`count(*)::int`,
    })
    .from(chatMisses)
    .where(inArray(chatMisses.clusterId, ids))
    .groupBy(chatMisses.clusterId, chatMisses.reason);

  const byCluster = new Map<string, Record<string, number>>();
  for (const r of reasonRows) {
    const m = byCluster.get(r.clusterId) ?? {};
    m[r.reason] = Number(r.n);
    byCluster.set(r.clusterId, m);
  }

  return clusters.map((c) => ({
    id: c.id,
    exemplarQuery: c.exemplarQuery,
    count: c.count,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
    reasons: byCluster.get(c.id) ?? {},
  }));
}

/** A cluster plus its member misses (newest first), or null if not found. */
export async function getCluster(
  db: Db,
  id: string,
): Promise<{ cluster: GapClusterRow; misses: ChatMissRow[] } | null> {
  const rows = await db.select().from(gapClusters).where(eq(gapClusters.id, id));
  const cluster = rows[0];
  if (!cluster) return null;
  const misses = await db
    .select()
    .from(chatMisses)
    .where(eq(chatMisses.clusterId, id))
    .orderBy(desc(chatMisses.createdAt));
  return { cluster, misses };
}

/** Close the loop: mark resolved + link the curated document. */
export async function resolveCluster(
  db: Db,
  id: string,
  documentId: string,
  actorIp: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(gapClusters)
    .set({ status: "resolved", resolvedDocumentId: documentId, resolvedAt: now, updatedAt: now })
    .where(eq(gapClusters.id, id))
    .execute();
  await logAudit(db, {
    action: "gap.resolve",
    entityType: "gap",
    entityId: id,
    summary: `resolved gap → document ${documentId}`,
    actorIp,
  });
}

/**
 * Idempotent gap resolution: create document + enqueue ingest + resolve cluster
 * in a single transaction. Retries with the same requestId return the existing result.
 */
export async function resolveGapAtomic(
  db: Db,
  clusterId: string,
  input: {
    requestId: string;
    title: string;
    body: string;
    actorIp: string;
  },
): Promise<{ documentId: string; jobId: string; corpusVersion: number }> {
  // Idempotency: check for existing document with same requestId
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.requestId, input.requestId))
    .limit(1);

  if (existing[0]) {
    const jobs = await db
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.documentId, existing[0].id))
      .limit(1);
    const cluster = await db
      .select({ resolvedAtCorpusVersion: gapClusters.resolvedAtCorpusVersion })
      .from(gapClusters)
      .where(eq(gapClusters.id, clusterId))
      .limit(1);
    return {
      documentId: existing[0].id,
      jobId: jobs[0]?.id ?? "",
      corpusVersion: cluster[0]?.resolvedAtCorpusVersion ?? 0,
    };
  }

  // Get current corpus version (count of succeeded jobs)
  const [{ value: corpusVersion }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.status, "succeeded"));

  return db.transaction(async (tx) => {
    const now = new Date();
    const documentId = randomUUID();

    // 1. Create document with requestId for idempotency
    await tx
      .insert(documents)
      .values({
        id: documentId,
        title: input.title,
        body: input.body,
        kind: "markdown",
        category: null,
        origin: "gap",
        status: "draft",
        contentHash: contentHash(input.body),
        createdAt: now,
        updatedAt: now,
        lastIngestedAt: null,
        corpusVersion: null,
        requestId: input.requestId,
      })
      .execute();

    // 2. Queue ingest job
    const jobId = randomUUID();
    await tx
      .insert(ingestionJobs)
      .values({
        id: jobId,
        documentId,
        kind: "single",
        status: "queued",
        error: null,
        chunksWritten: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      })
      .execute();

    // 3. Resolve cluster
    await tx
      .update(gapClusters)
      .set({
        status: "resolved",
        resolvedDocumentId: documentId,
        resolvedAt: now,
        resolvedAtCorpusVersion: corpusVersion,
        updatedAt: now,
      })
      .where(eq(gapClusters.id, clusterId))
      .execute();

    await logAudit(tx, {
      action: "gap.resolve",
      entityType: "gap",
      entityId: clusterId,
      summary: `resolved gap → document ${documentId} (atomic)`,
      actorIp: input.actorIp,
    });

    return { documentId, jobId, corpusVersion };
  });
}

/** Hide a cluster from the default view without curating content. */
export async function ignoreCluster(db: Db, id: string, actorIp: string): Promise<void> {
  await db
    .update(gapClusters)
    .set({ status: "ignored", updatedAt: new Date() })
    .where(eq(gapClusters.id, id))
    .execute();
  await logAudit(db, {
    action: "gap.ignore",
    entityType: "gap",
    entityId: id,
    summary: `ignored gap ${id}`,
    actorIp,
  });
}

/** Export all misses as CSV (both tables are plain relational → trivially exportable). */
export async function exportMissesCsv(db: Db): Promise<string> {
  const rows = await db
    .select({
      clusterId: chatMisses.clusterId,
      query: chatMisses.query,
      reason: chatMisses.reason,
      topScore: chatMisses.topScore,
      conversationId: chatMisses.conversationId,
      createdAt: chatMisses.createdAt,
    })
    .from(chatMisses)
    .orderBy(desc(chatMisses.createdAt));

  const header = "clusterId,query,reason,topScore,conversationId,createdAt";
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.clusterId, r.query, r.reason, r.topScore ?? "", r.conversationId, r.createdAt.toISOString()]
      .map(esc)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
