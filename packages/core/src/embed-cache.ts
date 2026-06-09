// In-memory cache for embed client allowed origins.
// Middleware uses this to set CSP frame-ancestors without DB access (Edge Runtime limitation).
// Cache is populated on first access and invalidated when clients are created/revoked.

type CacheEntry = {
  allowedOrigins: string[];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get allowed origins for a token from cache. Returns null if not cached or expired.
 */
export function getCachedOrigins(token: string): string[] | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(token);
    return null;
  }
  return entry.allowedOrigins;
}

/**
 * Set allowed origins in cache.
 */
export function setCachedOrigins(token: string, allowedOrigins: string[]): void {
  cache.set(token, {
    allowedOrigins,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Invalidate cache for a specific token. Called when admin creates/revokes a client.
 */
export function invalidateCache(token: string): void {
  cache.delete(token);
}

/**
 * Clear all cached entries. Called when admin updates any client.
 */
export function clearCache(): void {
  cache.clear();
}
