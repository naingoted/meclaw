import { initDb } from "@meclaw/core/db";
import { embedClients } from "@meclaw/core/db/schema";
import { eq } from "drizzle-orm";

export type EmbedClient = {
  id: string;
  publicToken: string;
  name: string;
  allowedOrigins: string[];
  rateLimitPerMin: number | null;
  createdAt: Date;
  revokedAt: Date | null;
};

/**
 * Look up an embed client by public token. Returns null for unknown or
 * revoked tokens — callers treat both cases as "reject".
 */
export async function resolveEmbedClient(
  db: Awaited<ReturnType<typeof initDb>>,
  token: string | null,
): Promise<EmbedClient | null> {
  if (!token) return null;
  const rows = await db
    .select()
    .from(embedClients)
    .where(eq(embedClients.publicToken, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  return {
    id: row.id,
    publicToken: row.publicToken,
    name: row.name,
    allowedOrigins: row.allowedOrigins ?? [],
    rateLimitPerMin: row.rateLimitPerMin,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

/** Exact-match (scheme + host + port). No wildcards, no trailing slash. */
export function isAllowedOrigin(client: EmbedClient, origin: string | null): boolean {
  if (!origin) return false;
  return client.allowedOrigins.includes(origin);
}

/** CSP `frame-ancestors` value. `'none'` when the client is null or has no origins. */
export function frameAncestorsHeader(client: EmbedClient | null): string {
  if (!client || client.allowedOrigins.length === 0) return "frame-ancestors 'none'";
  return `frame-ancestors ${client.allowedOrigins.join(" ")}`;
}

/**
 * Convenience for route handlers: build a shared db once per process
 * (mirrors the existing chat-route pattern).
 */
let dbPromise: ReturnType<typeof initDb> | null = null;
export function getChatDb(): ReturnType<typeof initDb> {
  return (dbPromise ??= initDb());
}
