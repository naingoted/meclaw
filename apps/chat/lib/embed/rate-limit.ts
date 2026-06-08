import type { RateLimitResult } from "../rate-limit";

interface Entry {
  count: number;
  windowStart: number;
}

const DEFAULT_WINDOW_MS = 60_000;

export function createEmbedRateLimiter({ defaultPerMin }: { defaultPerMin: number }) {
  const store = new Map<string, Entry>();

  function checkForKey(key: string, perMin: number): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now - entry.windowStart >= DEFAULT_WINDOW_MS) {
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

const EMBED_RATE_LIMIT_PER_MIN = parseInt(process.env.EMBED_RATE_LIMIT_PER_MIN || "60", 10);

export const embedClientRateLimiter = createEmbedRateLimiter({
  defaultPerMin: EMBED_RATE_LIMIT_PER_MIN,
});
