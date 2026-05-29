/**
 * In-memory IP-based rate limiter.
 *
 * ⚠️ NOTE: This implementation is per-process and resets on restart.
 * It is NOT multi-instance safe. For production or multi-process deployments,
 * use Redis or a distributed rate-limit service.
 *
 * The map is intentionally a simple in-memory structure; v1 is single-process
 * local dev + simple deployment. Post-v1: switch to Redis keyed by IP.
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

/**
 * Creates an in-memory rate limiter.
 *
 * @param maxRequests Max requests allowed per IP in the window
 * @param windowMs Window duration in milliseconds
 * @returns A rate limiter that tracks requests per IP
 */
export function createRateLimiter({
  maxRequests,
  windowMs,
}: {
  maxRequests: number;
  windowMs: number;
}): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  return {
    check(ip: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(ip);

      // No entry or window has expired — start a new window
      if (!entry || now - entry.windowStart >= windowMs) {
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
const RATE_LIMIT_MAX_REQUESTS = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS || "20",
  10
);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "60000",
  10
); // 60 seconds

export const chatRateLimiter = createRateLimiter({
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
});
