import { describe, it, expect, afterEach } from "vitest";
import { configSnapshot } from "./config-snapshot";
import { configCache } from "./config-cache";
import { defaultSettings, type SettingsValue } from "./settings";

// configSnapshot reads getSettings(db); a primed cache short-circuits the DB,
// so we never touch a real connection here.
afterEach(() => configCache.clear());

describe("configSnapshot", () => {
  it("forwards public alongside agents/shared/rag", async () => {
    const value: SettingsValue = defaultSettings();
    configCache.set(value);
    const snap = await configSnapshot({} as never);
    expect(snap.public).toBeDefined();
    expect(snap.public.greeting).toBe(value.public.greeting);
    expect(snap.public.contactEmail).toBe(value.public.contactEmail);
    expect(snap.agents).toBeDefined();
    expect(snap.shared).toBeDefined();
    expect(snap.rag).toBeDefined();
  });
});
