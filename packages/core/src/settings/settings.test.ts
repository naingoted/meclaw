import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settings } from "../db/schema";
import { makeTestDb } from "../db/test-db";
import { configCache } from "./config-cache";
import {
  defaultSettings,
  getSettings,
  getSettingsVersion,
  SettingsSchema,
  updateSettings,
} from "./settings";

afterEach(() => {
  vi.useRealTimers();
});

describe("settings rag tunables", () => {
  it("defaultSettings seeds scoreFloor + clusterRadius", () => {
    const s = defaultSettings();
    expect(s.rag.scoreFloor).toBe(0.35);
    expect(s.rag.clusterRadius).toBe(0.15);
  });

  it("SettingsSchema backfills missing tunables on parse (legacy rows)", () => {
    const legacy = {
      agents: {},
      shared: { persona: "" },
      rag: { topK: 4, scoreThreshold: 0, gapMatchThreshold: 0.15 },
      public: { greeting: "", suggestions: [], calUrl: "", githubUrl: "" },
    };
    const parsed = SettingsSchema.parse(legacy);
    expect(parsed.rag.scoreFloor).toBe(0.35);
    expect(parsed.rag.clusterRadius).toBe(0.15);
  });

  it("parses legacy rows: tinyCorpusThreshold stripped, gapMatchThreshold defaulted", () => {
    const parsed = SettingsSchema.parse({
      ...defaultSettings(),
      rag: { topK: 4, scoreThreshold: 0, tinyCorpusThreshold: 8000 },
    });
    expect(parsed.rag.gapMatchThreshold).toBe(0.15);
    expect("tinyCorpusThreshold" in parsed.rag).toBe(false);
  });
});

describe("settings new wired fields", () => {
  it("defaultSettings seeds triage.confidence and public.contactEmail", () => {
    const s = defaultSettings();
    expect(s.agents.triage.confidence).toBe(0.5);
    expect(s.public.contactEmail).toBe("naingoted@gmail.com");
  });

  it("round-trips triage.confidence and public.contactEmail", () => {
    const s = defaultSettings();
    s.agents.triage.confidence = 0.7;
    s.public.contactEmail = "owner@example.com";
    const parsed = SettingsSchema.parse(s);
    expect(parsed.agents.triage.confidence).toBe(0.7);
    expect(parsed.public.contactEmail).toBe("owner@example.com");
  });

  it("backfills contactEmail on legacy rows missing it", () => {
    const legacy = {
      agents: {},
      shared: { persona: "" },
      rag: { topK: 4, scoreThreshold: 0, gapMatchThreshold: 0.15 },
      public: { greeting: "", suggestions: [], calUrl: "", githubUrl: "" },
    };
    const parsed = SettingsSchema.parse(legacy);
    expect(parsed.public.contactEmail).toBe("naingoted@gmail.com");
  });

  it("confidence is optional (non-triage agents omit it)", () => {
    const s = defaultSettings();
    expect(s.agents.knowledge.confidence).toBeUndefined();
    expect(() => SettingsSchema.parse(s)).not.toThrow();
  });
});

describe("version-aware settings cache", () => {
  it("returns the cached value when DB updatedAt matches the cached version", async () => {
    const { db } = await makeTestDb();
    configCache.clear();

    const first = await getSettings(db);
    first.public.greeting = "mutated local object";

    const second = await getSettings(db);
    expect(second.public.greeting).toBe("mutated local object");
  });

  it("invalidates the cached value when DB updatedAt changes", async () => {
    const { db } = await makeTestDb();
    configCache.clear();

    const first = await getSettings(db);
    expect(first.public.greeting).toBe("Hi! I'm meclaw, Thet's personal bot.");

    const fresh = structuredClone(first);
    fresh.public.greeting = "Fresh from another process";
    await db
      .update(settings)
      .set({
        public: fresh.public,
        updatedAt: new Date("2026-06-03T01:02:03.000Z"),
      })
      .where(eq(settings.id, 1))
      .execute();

    const second = await getSettings(db);
    expect(second.public.greeting).toBe("Fresh from another process");
  });

  it("getSettingsVersion returns the singleton updatedAt timestamp as an ISO string", async () => {
    const { db } = await makeTestDb();
    configCache.clear();

    await getSettings(db);
    await db
      .update(settings)
      .set({ updatedAt: new Date("2026-06-03T04:05:06.000Z") })
      .where(eq(settings.id, 1))
      .execute();

    await expect(getSettingsVersion(db)).resolves.toBe("2026-06-03T04:05:06.000Z");
  });

  it("updateSettings clears the local cache after write", async () => {
    const { db } = await makeTestDb();
    configCache.clear();

    const current = await getSettings(db);
    const next = structuredClone(current);
    next.public.greeting = "Saved through admin";

    await updateSettings(db, next, "127.0.0.1");

    const cached = configCache.getEntry();
    expect(cached).toBeNull();
  });

  it("updateSettings advances the version when writes share the same clock millisecond", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T07:08:09.000Z"));
    const { db } = await makeTestDb();
    configCache.clear();

    const current = await getSettings(db);
    const first = structuredClone(current);
    first.public.greeting = "First save";

    await updateSettings(db, first, "127.0.0.1");
    const firstVersion = await getSettingsVersion(db);

    const second = structuredClone(first);
    second.public.greeting = "Second save";
    await updateSettings(db, second, "127.0.0.1");

    await expect(getSettingsVersion(db)).resolves.toBe("2026-06-03T07:08:09.002Z");
    expect(firstVersion).toBe("2026-06-03T07:08:09.001Z");
  });

  it("updateSettings advances the version for overlapping same-clock writes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T08:09:10.000Z"));
    const { db } = await makeTestDb();
    configCache.clear();

    const current = await getSettings(db);
    const first = structuredClone(current);
    first.public.greeting = "Concurrent save one";
    const second = structuredClone(current);
    second.public.greeting = "Concurrent save two";

    await Promise.all([
      updateSettings(db, first, "127.0.0.1"),
      updateSettings(db, second, "127.0.0.1"),
    ]);

    await expect(getSettingsVersion(db)).resolves.toBe("2026-06-03T08:09:10.002Z");
  });
});
