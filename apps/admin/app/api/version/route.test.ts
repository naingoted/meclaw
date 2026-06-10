import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/version", () => {
  it("returns version and commit from env", async () => {
    vi.stubEnv("MECLAW_VERSION", "v2.0.0");
    vi.stubEnv("GIT_SHA", "abcdef1234567890");
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ version: "v2.0.0", commit: "abcdef1" });
  });

  it("returns null when env vars are unset", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBeNull();
    expect(body.commit).toBeNull();
  });
});
