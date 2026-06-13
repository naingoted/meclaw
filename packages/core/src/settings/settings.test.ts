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
    expect(s.public.copy.emptyStateIntro).toBe("Ask me anything about how leanior works");
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
    expect(parsed.public.copy.bookCallLabel).toBe("Book a call");
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

describe("branding settings", () => {
  it("defaults brand fields for legacy rows missing them", () => {
    const legacy = defaultSettings();
    const { botName, botTagline, brandLogoUrl, brandAccent, ...oldPublic } =
      legacy.public as Record<string, unknown>;
    const parsed = SettingsSchema.parse({ ...legacy, public: oldPublic });
    expect(parsed.public.botName).toBe("meclaw");
    expect(parsed.public.brandLogoUrl).toBe("");
    expect(parsed.public.brandAccent).toBe("");
  });

  it("seeds branding from env", () => {
    vi.stubEnv("BOT_NAME", "acmebot");
    vi.stubEnv("BOT_OWNER_NAME", "Alice");
    vi.stubEnv("BOT_TAGLINE", "Acme's assistant");
    try {
      const s = defaultSettings();
      expect(s.public.botName).toBe("acmebot");
      expect(s.public.botTagline).toBe("Acme's assistant");
      expect(s.public.greeting).toContain("acmebot");
      expect(s.public.greeting).toContain("Alice");
      expect(s.agents.knowledge.prompt).toContain("Alice");
      expect(s.public.suggestions.join(" ")).not.toContain("Thet");
      expect(s.public.suggestions[0]).toContain("Alice");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("accepts valid http(s) URLs for brandLogoUrl", () => {
    const base = defaultSettings();
    expect(() =>
      SettingsSchema.parse({
        ...base,
        public: { ...base.public, brandLogoUrl: "https://example.com/logo.png" },
      }),
    ).not.toThrow();
    expect(() =>
      SettingsSchema.parse({
        ...base,
        public: { ...base.public, brandLogoUrl: "http://cdn.test/img.svg?v=1&q=2" },
      }),
    ).not.toThrow();
    expect(() =>
      SettingsSchema.parse({
        ...base,
        public: { ...base.public, brandLogoUrl: "" },
      }),
    ).not.toThrow();
  });

  it("rejects brandLogoUrl bypass vectors (quote injection, javascript:, whitespace)", () => {
    const base = defaultSettings();
    const bad = [
      `https://x" onload=alert(1)`,
      `https://x' onload=alert(1)`,
      "javascript:alert(1)",
      "https://evil with space",
      `https://evil\ttab`,
      "https://evil<script>",
      "ftp://not-http.example.com/img.png",
    ];
    for (const url of bad) {
      expect(() =>
        SettingsSchema.parse({
          ...base,
          public: { ...base.public, brandLogoUrl: url },
        }),
      ).toThrow();
    }
  });

  it("accepts hex colors for brandAccent", () => {
    const base = defaultSettings();
    for (const color of ["#fff", "#FFF", "#abcd", "#aabbcc", "#aabbcc88"]) {
      expect(() =>
        SettingsSchema.parse({
          ...base,
          public: { ...base.public, brandAccent: color },
        }),
      ).not.toThrow();
    }
  });

  it("rejects brandAccent bypass vectors (color function injection, named colors, trailing junk)", () => {
    const base = defaultSettings();
    const bad = [
      "rgb(expression(alert(1)))",
      "rgb(255, 0, 0)",
      "hsl(120, 50%, 50%)",
      "oklch(0.5 0.2 240)",
      "#fff; background:url(evil)",
      "#gg0000",
      "red",
      "blue",
      "transparent",
      "#123456789", // too many hex digits
      "#12", // too few
    ];
    for (const color of bad) {
      expect(() =>
        SettingsSchema.parse({
          ...base,
          public: { ...base.public, brandAccent: color },
        }),
      ).toThrow();
    }
  });
});
