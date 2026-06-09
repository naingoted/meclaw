import { describe, expect, it } from "vitest";
import { createEmbedRateLimiter } from "./rate-limit";

describe("createEmbedRateLimiter", () => {
  it("tracks keys independently", () => {
    const rl = createEmbedRateLimiter({ defaultPerMin: 2 });
    expect(rl.check("pk_a").allowed).toBe(true);
    expect(rl.check("pk_a").allowed).toBe(true);
    expect(rl.check("pk_a").allowed).toBe(false);
    expect(rl.check("pk_b").allowed).toBe(true);
  });

  it("honors the per-client override", () => {
    const rl = createEmbedRateLimiter({ defaultPerMin: 2 });
    expect(rl.check("pk_a", 5).allowed).toBe(true);
    expect(rl.check("pk_a", 5).allowed).toBe(true);
    expect(rl.check("pk_a", 5).allowed).toBe(true);
    expect(rl.check("pk_a", 5).allowed).toBe(true);
    expect(rl.check("pk_a", 5).allowed).toBe(true);
    expect(rl.check("pk_a", 5).allowed).toBe(false);
  });

  it("returns retryAfter seconds", () => {
    const rl = createEmbedRateLimiter({ defaultPerMin: 1 });
    rl.check("pk_x");
    const r = rl.check("pk_x");
    expect(r.allowed).toBe(false);
    expect(typeof r.retryAfter).toBe("number");
    expect(r.retryAfter! > 0).toBe(true);
  });
});
