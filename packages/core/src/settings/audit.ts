import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { auditLog } from "../db/schema";
import type { Db } from "../db/types";

export type AuditAction =
  | "document.create"
  | "document.update"
  | "document.delete"
  | "config.update"
  | "ingest.start"
  | "ingest.succeed"
  | "ingest.fail"
  | "gap.resolve"
  | "gap.ignore"
  | "embed_client.create"
  | "embed_client.update"
  | "embed_client.revoke"
  | "user.create"
  | "user.role_change"
  | "user.password_reset"
  | "user.password_change"
  | "user.delete";

export type AuditInput = {
  action: AuditAction;
  entityType: "document" | "settings" | "job" | "gap" | "embed_client" | "admin_user";
  entityId?: string;
  summary: string;
  meta?: unknown;
  actorIp?: string;
};

export async function logAudit(db: Db, input: AuditInput): Promise<void> {
  await db
    .insert(auditLog)
    .values({
      id: randomUUID(),
      ts: new Date(),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      meta: input.meta ?? null,
      actorIp: input.actorIp ?? null,
    })
    .execute();
}

export async function recentAudit(db: Db, limit = 50) {
  return db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(limit);
}
