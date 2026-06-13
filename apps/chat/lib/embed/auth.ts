import { initDb } from "@meclaw/core/db";
import { embedClients } from "@meclaw/core/db/schema";
import { eq, isNull } from "drizzle-orm";

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

/** The chat app's own browser origin (same-origin iframe requests carry this Origin). */
export function getChatAppOrigin(): string {
  if (process.env.CHAT_APP_ORIGIN) return process.env.CHAT_APP_ORIGIN;
  return process.env.NODE_ENV === "production"
    ? "https://meclaw.leanior.com"
    : "http://localhost:3000";
}

/**
 * Resolve the authoritative embedding origin for token verification.
 * Cross-origin browser fetches attach an unforgeable Origin header; same-origin
 * iframe requests fall back to the body parentOrigin (legacy embed path).
 */
export function resolveVerifiedOrigin(
  req: Request,
  parentOriginFromBody: string | null,
): string | null {
  const originHeader = req.headers.get("Origin");
  const chatAppOrigin = getChatAppOrigin();
  if (originHeader && originHeader !== chatAppOrigin) {
    return originHeader;
  }
  return parentOriginFromBody;
}

/** Union of all non-revoked embed clients' allowedOrigins (for CORS preflight). */
export async function loadUnionAllowedOrigins(
  db: Awaited<ReturnType<typeof initDb>>,
): Promise<string[]> {
  const rows = await db
    .select({ allowedOrigins: embedClients.allowedOrigins })
    .from(embedClients)
    .where(isNull(embedClients.revokedAt));
  const set = new Set<string>();
  for (const row of rows) {
    for (const o of row.allowedOrigins ?? []) {
      set.add(o);
    }
  }
  return [...set];
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
  // biome-ignore lint/suspicious/noAssignInExpressions: lazy DB init via logical assignment
  return (dbPromise ??= initDb());
}
