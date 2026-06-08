import type { RateLimitResult } from "../rate-limit";

interface Entry {
  count: number;
  windowStart: number;
}

const DEFAULT_WINDOW_MS = 60_000;
// Match the existing chatRateLimiter's sweep threshold — lazy eviction when
// the store grows past this size. Low risk in v1 (few embed clients) but
// guards against unbounded growth in long-lived processes.
const MEMORY_SWEEP_THRESHOLD = 10_000;

export function createEmbedRateLimiter({ defaultPerMin }: { defaultPerMin: number }) {
  const store = new Map<string, Entry>();

  function cleanupExpired(now: number): void {
    if (store.size <= MEMORY_SWEEP_THRESHOLD) return;
    for (const [key, entry] of store.entries()) {
      if (now - entry.windowStart >= DEFAULT_WINDOW_MS) store.delete(key);
    }
  }

  function checkForKey(key: string, perMin: number): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now - entry.windowStart >= DEFAULT_WINDOW_MS) {
      store.delete(key);
      cleanupExpired(now);
      store.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }
    if (entry.count < perMin) {
      entry.count += 1;
      return { allowed: true };
    }
    const retryAfter = Math.ceil((DEFAULT_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  return {
    check(key: string, overridePerMin?: number | null): RateLimitResult {
      const perMin = overridePerMin ?? defaultPerMin;
      return checkForKey(key, perMin);
    },
  };
}

/**
 * Parse a positive-integer env var with a safe fallback. Returns `fallback`
 * for missing / empty / non-numeric / non-positive values, so a misconfigured
 * env (e.g., "abc" or "0") cannot silently disable the limiter.
 */
function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

const EMBED_RATE_LIMIT_PER_MIN = parsePositiveIntEnv("EMBED_RATE_LIMIT_PER_MIN", 60);

export const embedClientRateLimiter = createEmbedRateLimiter({
  defaultPerMin: EMBED_RATE_LIMIT_PER_MIN,
});
