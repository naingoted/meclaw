import { randomBytes } from "node:crypto";
import { embedClients } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { logAudit } from "@meclaw/core/settings";
import { desc, eq, isNull } from "drizzle-orm";

export type EmbedClientRow = typeof embedClients.$inferSelect;
export type EmbedClientInput = {
  name: string;
  allowedOrigins: string[];
  rateLimitPerMin?: number | null;
};

/** Generate a public token with `pk_` prefix + 32 random hex chars */
export function generatePublicToken(): string {
  return `pk_${randomBytes(16).toString("hex")}`;
}

export async function listEmbedClients(db: Db): Promise<EmbedClientRow[]> {
  const rows = await db.select().from(embedClients).orderBy(desc(embedClients.createdAt));
  return rows;
}

export async function listActiveEmbedClients(db: Db): Promise<EmbedClientRow[]> {
  const rows = await db
    .select()
    .from(embedClients)
    .where(isNull(embedClients.revokedAt))
    .orderBy(desc(embedClients.createdAt));
  return rows;
}

export async function getEmbedClient(db: Db, id: string): Promise<EmbedClientRow | undefined> {
  const rows = await db.select().from(embedClients).where(eq(embedClients.id, id));
  return rows[0];
}

export async function createEmbedClient(
  db: Db,
  input: EmbedClientInput,
  actorIp: string,
): Promise<EmbedClientRow> {
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    publicToken: generatePublicToken(),
    name: input.name,
    allowedOrigins: input.allowedOrigins,
    rateLimitPerMin: input.rateLimitPerMin ?? null,
    createdAt: now,
    revokedAt: null,
  };
  await db.insert(embedClients).values(row).execute();
  await logAudit(db, {
    action: "embed_client.create",
    entityType: "embed_client",
    entityId: row.id,
    summary: `created "${input.name}"`,
    actorIp,
  });
  return row as EmbedClientRow;
}

export async function updateEmbedClient(
  db: Db,
  id: string,
  input: Partial<EmbedClientInput>,
  actorIp: string,
): Promise<EmbedClientRow> {
  const patch: Partial<{
    name: string;
    allowedOrigins: string[];
    rateLimitPerMin: number | null;
  }> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.allowedOrigins !== undefined) patch.allowedOrigins = input.allowedOrigins;
  if (input.rateLimitPerMin !== undefined) patch.rateLimitPerMin = input.rateLimitPerMin;

  await db.update(embedClients).set(patch).where(eq(embedClients.id, id)).execute();
  await logAudit(db, {
    action: "embed_client.update",
    entityType: "embed_client",
    entityId: id,
    summary: `updated "${input.name ?? id}"`,
    actorIp,
  });
  return (await getEmbedClient(db, id))!;
}

export async function revokeEmbedClient(db: Db, id: string, actorIp: string): Promise<void> {
  const existing = await getEmbedClient(db, id);
  await db
    .update(embedClients)
    .set({ revokedAt: new Date() })
    .where(eq(embedClients.id, id))
    .execute();
  await logAudit(db, {
    action: "embed_client.revoke",
    entityType: "embed_client",
    entityId: id,
    summary: `revoked "${existing?.name ?? id}"`,
    actorIp,
  });
}
