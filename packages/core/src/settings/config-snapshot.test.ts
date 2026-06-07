import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb } from "../db/test-db";
import { configCache } from "./config-cache";
import { configSnapshot } from "./config-snapshot";
import { defaultSettings } from "./settings";

afterEach(() => configCache.clear());

describe("configSnapshot", () => {
  it("forwards public alongside agents/shared/rag", async () => {
    const { db } = await makeTestDb();
    const value = defaultSettings();
    const snap = await configSnapshot(db);
    expect(snap.public).toBeDefined();
    expect(snap.public.greeting).toBe(value.public.greeting);
    expect(snap.public.contactEmail).toBe(value.public.contactEmail);
    expect(snap.agents).toBeDefined();
    expect(snap.shared).toBeDefined();
    expect(snap.rag).toBeDefined();
  });
});
