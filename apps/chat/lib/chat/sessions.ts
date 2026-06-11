// Pure, SSR-safe owner of all chat localStorage.
//
// Two storage models coexist:
//  - Main chat (normal mode): a multi-conversation INDEX under SESSIONS_KEY.
//  - Embed widget: the legacy SINGLE-ENTRY model, one resume entry per embed
//    token under `meclaw:resume:<embedToken>`. Kept verbatim so embeds are
//    behaviorally unchanged.
//
// Every function is try/caught and degrades to a no-op / null when localStorage
// is unavailable (private browsing, quota, SSR). Never throws.

export type ResumeEntry = { conversationId: string; resumeToken: string };

export type ChatSession = {
  conversationId: string;
  resumeToken: string;
  /** First user message, truncated; "" until the first user turn. */
  title: string;
  /** epoch ms */
  createdAt: number;
  /** epoch ms, bumped on each turn */
  updatedAt: number;
};

type SessionIndex = { sessions: ChatSession[] };

const RESUME_KEY_PREFIX = "meclaw:resume:";
const SESSIONS_KEY = "meclaw:sessions";
const TITLE_MAX = 80;

function indexKey(scope: string | undefined): string {
  return scope ? `meclaw:sessions:${scope}` : SESSIONS_KEY;
}

// First-party HMAC sentinel (server-side embedClientId) and legacy single-entry
// localStorage key for the main chat.
export const MAIN_RESUME_KEY = "__main__";

// ---- low-level localStorage (SSR-safe, never throws) ----

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private browsing / quota — silently ignore
  }
}

function removeRaw(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---- embed single-entry helpers (legacy model, unchanged behavior) ----

export function readResumeEntry(embedToken: string): ResumeEntry | null {
  const raw = readRaw(`${RESUME_KEY_PREFIX}${embedToken}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "conversationId" in parsed &&
      "resumeToken" in parsed &&
      typeof (parsed as ResumeEntry).conversationId === "string" &&
      typeof (parsed as ResumeEntry).resumeToken === "string"
    ) {
      return parsed as ResumeEntry;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeResumeEntry(embedToken: string, entry: ResumeEntry): void {
  writeRaw(`${RESUME_KEY_PREFIX}${embedToken}`, JSON.stringify(entry));
}

export function clearResumeEntry(embedToken: string): void {
  removeRaw(`${RESUME_KEY_PREFIX}${embedToken}`);
}

// ---- main-chat session index ----

function isChatSession(value: unknown): value is ChatSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ChatSession).conversationId === "string" &&
    typeof (value as ChatSession).resumeToken === "string" &&
    typeof (value as ChatSession).title === "string" &&
    typeof (value as ChatSession).createdAt === "number" &&
    typeof (value as ChatSession).updatedAt === "number"
  );
}

function readIndex(scope: string | undefined): SessionIndex {
  const raw = readRaw(indexKey(scope));
  if (!raw) return { sessions: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as SessionIndex).sessions)
    ) {
      return { sessions: (parsed as SessionIndex).sessions.filter(isChatSession) };
    }
    return { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

function writeIndex(scope: string | undefined, index: SessionIndex): void {
  writeRaw(indexKey(scope), JSON.stringify(index));
}

/** All sessions, newest `updatedAt` first. */
export function listSessions(options?: { scope?: string }): ChatSession[] {
  return readIndex(options?.scope)
    .sessions.slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(conversationId: string, scope?: string): ChatSession | null {
  return readIndex(scope).sessions.find((s) => s.conversationId === conversationId) ?? null;
}

/**
 * Create or merge a session by conversationId, bumping `updatedAt` to now.
 * Unspecified fields keep their existing value (or defaults on create).
 */
export function upsertSession(
  partial: Partial<ChatSession> & { conversationId: string; scope?: string },
): void {
  const { scope, ...fields } = partial;
  const now = Date.now();
  const index = readIndex(scope);
  const existing = index.sessions.find((s) => s.conversationId === fields.conversationId);
  if (existing) {
    Object.assign(existing, fields, { updatedAt: now });
  } else {
    index.sessions.push({
      conversationId: fields.conversationId,
      resumeToken: fields.resumeToken ?? "",
      title: fields.title ?? "",
      createdAt: fields.createdAt ?? now,
      updatedAt: now,
    });
  }
  writeIndex(scope, index);
}

/** Store/refresh the resume token for a conversation (from the SSE handler). */
export function setSessionToken(conversationId: string, resumeToken: string, scope?: string): void {
  upsertSession({ conversationId, resumeToken, scope });
}

/** Set the title once, on the first user message, only if currently empty. */
export function setSessionTitle(conversationId: string, title: string, scope?: string): void {
  const trimmed = title.trim().slice(0, TITLE_MAX);
  if (!trimmed) return;
  const existing = getSession(conversationId, scope);
  if (existing && existing.title.trim().length > 0) return;
  upsertSession({ conversationId, title: trimmed, scope });
}

/** Remove a session from the index (client-only; DB rows untouched). */
export function removeSession(conversationId: string, scope?: string): void {
  const index = readIndex(scope);
  writeIndex(scope, {
    sessions: index.sessions.filter((s) => s.conversationId !== conversationId),
  });
}

/**
 * One-time migration: fold a legacy `meclaw:resume:__main__` single entry into
 * the index when the index is empty, then drop the legacy key.
 */
export function migrateLegacyEntry(): void {
  if (readIndex(undefined).sessions.length > 0) return;
  const legacy = readResumeEntry(MAIN_RESUME_KEY);
  if (!legacy) return;
  const now = Date.now();
  upsertSession({
    conversationId: legacy.conversationId,
    resumeToken: legacy.resumeToken,
    title: "",
    createdAt: now,
    updatedAt: now,
  });
  clearResumeEntry(MAIN_RESUME_KEY);
}
