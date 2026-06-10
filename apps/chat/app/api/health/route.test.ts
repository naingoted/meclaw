import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  const original = process.env.GIT_SHA;

  beforeEach(() => {
    delete process.env.GIT_SHA;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = original;
    }
  });

  it("reports ok and the build SHA from the environment", async () => {
    process.env.GIT_SHA = "abc1234";
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", sha: "abc1234" });
  });

  it('falls back to "dev" when GIT_SHA is unset', async () => {
    const { GET } = await import("./route");

    const res = await GET();

    await expect(res.json()).resolves.toEqual({ status: "ok", sha: "dev" });
  });
});
