import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, type RateLimiter } from "./rate-limit";

describe("Rate Limiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter({
      maxRequests: 3, // Allow 3 requests
      windowMs: 1000, // Per 1 second
    });
  });

  it("allows requests under the limit", () => {
    const ip = "192.168.1.1";

    expect(limiter.check(ip)).toEqual({ allowed: true });
    expect(limiter.check(ip)).toEqual({ allowed: true });
    expect(limiter.check(ip)).toEqual({ allowed: true });
  });

  it("blocks requests exceeding the limit", () => {
    const ip = "192.168.1.1";

    limiter.check(ip); // 1st
    limiter.check(ip); // 2nd
    limiter.check(ip); // 3rd
    const result = limiter.check(ip); // 4th — over limit

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("isolates rate limits per IP", () => {
    const ip1 = "192.168.1.1";
    const ip2 = "192.168.1.2";

    limiter.check(ip1);
    limiter.check(ip1);
    limiter.check(ip1);
    const resultIp1 = limiter.check(ip1); // 4th for ip1 — blocked

    expect(resultIp1.allowed).toBe(false);

    // ip2 should still have all 3 requests available
    expect(limiter.check(ip2).allowed).toBe(true);
    expect(limiter.check(ip2).allowed).toBe(true);
    expect(limiter.check(ip2).allowed).toBe(true);
    expect(limiter.check(ip2).allowed).toBe(false);
  });

  it("resets after window expiry (with fake timers)", () => {
    vi.useFakeTimers();
    const ip = "192.168.1.1";

    // First window: exhaust limit
    limiter.check(ip);
    limiter.check(ip);
    limiter.check(ip);
    expect(limiter.check(ip).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(1001);

    // Window reset — should allow requests again
    expect(limiter.check(ip).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("retryAfter header reflects remaining window time", () => {
    vi.useFakeTimers();
    const ip = "192.168.1.1";

    limiter.check(ip);
    limiter.check(ip);
    limiter.check(ip);

    // 100ms into the 1000ms window
    vi.advanceTimersByTime(100);
    const result = limiter.check(ip);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeCloseTo(0.9, 0); // ~900ms remaining → ~0.9s

    vi.useRealTimers();
  });

  it("evicts expired entries to keep memory bounded", () => {
    vi.useFakeTimers();

    // Create a limiter with very low threshold to test eviction
    const testLimiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 1000,
    });

    // Simulate traffic from many IPs in a batch
    const ips = Array.from({ length: 100 }, (_, i) => `192.168.${i}.1`);
    ips.forEach((ip) => {
      testLimiter.check(ip);
    });

    // All entries should be in the store now
    // (Note: we can't directly inspect store size, but we can verify behavior)

    // Advance time past the window
    vi.advanceTimersByTime(1001);

    // Check a new IP — this should trigger cleanup of expired entries
    testLimiter.check("10.0.0.1");

    // Now check one of the old IPs — window should have reset
    // and it should be allowed again (proving old entry was evicted or reset)
    const resultAfterReset = testLimiter.check(ips[0]);
    expect(resultAfterReset.allowed).toBe(true);

    vi.useRealTimers();
  });
});

describe("global chat ceiling", () => {
  it("blocks all callers once the stack-wide budget is spent", () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    // Different IPs all consume the same global key.
    expect(limiter.check("global").allowed).toBe(true);
    expect(limiter.check("global").allowed).toBe(true);
    expect(limiter.check("global").allowed).toBe(true);
    const fourth = limiter.check("global");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfter).toBeGreaterThan(0);
  });
});
