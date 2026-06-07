/**
 * In-memory IP-based rate limiter with bounded memory.
 *
 * ⚠️ NOTE: This implementation is per-process and resets on restart.
 * It is NOT multi-instance safe. For production or multi-process deployments,
 * use Redis or a distributed rate-limit service.
 *
 * Memory bounds: Expired entries are evicted on check (lazy eviction).
 * Additionally, if store grows past threshold, all expired entries are swept.
 * v1 is single-process local dev + simple deployment. Post-v1: switch to Redis.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // Seconds to wait before retrying (if allowed === false)
}

export interface RateLimiter {
  check(ip: string): RateLimitResult;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Threshold for triggering a memory sweep (delete expired entries)
const MEMORY_SWEEP_THRESHOLD = 10000; // ~10k IPs

/**
 * Creates an in-memory rate limiter with memory bounds.
 *
 * @param maxRequests Max requests allowed per IP in the window
 * @param windowMs Window duration in milliseconds
 * @returns A rate limiter that tracks requests per IP with bounded memory
 */
export function createRateLimiter({
  maxRequests,
  windowMs,
}: {
  maxRequests: number;
  windowMs: number;
}): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  /**
   * Opportunistically delete expired entries when the map grows.
   * Lightweight cleanup: only run when store exceeds threshold.
   */
  function cleanupIfNeeded(now: number): void {
    if (store.size > MEMORY_SWEEP_THRESHOLD) {
      let deleted = 0;
      for (const [ip, entry] of store.entries()) {
        if (now - entry.windowStart >= windowMs) {
          store.delete(ip);
          deleted += 1;
        }
      }
      // Optional: log for observability in prod
      if (deleted > 0) {
        // console.debug(`[rate-limit] Cleaned up ${deleted} expired entries`);
      }
    }
  }

  return {
    check(ip: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(ip);

      // No entry or window has expired — start a new window
      if (!entry || now - entry.windowStart >= windowMs) {
        // Clean up expired entries opportunistically
        store.delete(ip);
        cleanupIfNeeded(now);
        store.set(ip, { count: 1, windowStart: now });
        return { allowed: true };
      }

      // Window is still active
      if (entry.count < maxRequests) {
        entry.count += 1;
        return { allowed: true };
      }

      // Limit exceeded — calculate remaining time in the window
      const remainingMs = windowMs - (now - entry.windowStart);
      const retryAfter = Math.ceil(remainingMs / 1000); // Round up to nearest second

      return { allowed: false, retryAfter };
    },
  };
}

// Singleton rate limiter for the chat route.
// Configuration: env override support for testing/deployment flexibility.
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "20", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10); // 60 seconds

export const chatRateLimiter = createRateLimiter({
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
});
