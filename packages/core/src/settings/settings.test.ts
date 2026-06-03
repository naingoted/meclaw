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
