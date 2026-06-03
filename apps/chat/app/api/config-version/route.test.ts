import { beforeEach, describe, expect, it, vi } from "vitest";

const initDb = vi.fn(async () => ({}));
const getSettingsVersion = vi.fn(async () => "2026-06-03T01:02:03.000Z");
const getSettings = vi.fn(async () => ({}));

vi.mock("@meclaw/core/db", () => ({
  initDb,
}));

vi.mock("@meclaw/core/settings", () => ({
  getSettingsVersion,
  getSettings,
}));

describe("GET /api/config-version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initDb.mockResolvedValue({});
    getSettingsVersion.mockResolvedValue("2026-06-03T01:02:03.000Z");
    getSettings.mockResolvedValue({});
  });

  it("returns the settings version with no-store caching", async () => {
    const { GET } = await import("./route");

    const res = await GET();
    await expect(res.json()).resolves.toEqual({
      version: "2026-06-03T01:02:03.000Z",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("creates the default settings row when no version exists yet", async () => {
    getSettingsVersion.mockResolvedValueOnce(null).mockResolvedValueOnce("2026-06-03T09:00:00.000Z");
    const { GET } = await import("./route");

    const res = await GET();

    expect(getSettings).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      version: "2026-06-03T09:00:00.000Z",
    });
  });

  it("returns 503 on DB failure", async () => {
    initDb.mockRejectedValue(new Error("db down"));
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "config version unavailable" });
  });
});
