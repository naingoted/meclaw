import { describe, it, expect } from "vitest";
import { defaultSettings, SettingsSchema } from "./settings";

describe("settings rag tunables", () => {
  it("defaultSettings seeds scoreFloor + clusterRadius", () => {
    const s = defaultSettings();
    expect(s.rag.scoreFloor).toBe(0.35);
    expect(s.rag.clusterRadius).toBe(0.15);
  });

  it("SettingsSchema backfills missing tunables on parse (legacy rows)", () => {
    const legacy = {
      agents: {}, shared: { persona: "" },
      rag: { topK: 4, scoreThreshold: 0, tinyCorpusThreshold: 8000 },
      public: { greeting: "", suggestions: [], calUrl: "", githubUrl: "" },
    };
    const parsed = SettingsSchema.parse(legacy);
    expect(parsed.rag.scoreFloor).toBe(0.35);
    expect(parsed.rag.clusterRadius).toBe(0.15);
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
      agents: {}, shared: { persona: "" },
      rag: { topK: 4, scoreThreshold: 0, tinyCorpusThreshold: 8000 },
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
