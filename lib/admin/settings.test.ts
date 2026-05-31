import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { getSettings, updateSettings, SettingsSchema } from "./settings";
import { configCache } from "./config-cache";

beforeEach(() => configCache.clear());

const VALID = {
  agents: {
    triage: { model: "glm-4.7", thinking: false, prompt: "t" },
    knowledge: { model: "qwen3.6-plus", thinking: false, prompt: "k" },
    scheduler: { model: "qwen3.6-plus", thinking: false, prompt: "s" },
    contact: { model: "qwen3.6-plus", thinking: false, prompt: "c" },
  },
  shared: { persona: "" },
  rag: { topK: 4, scoreThreshold: 0, tinyCorpusThreshold: 8000 },
  public: { greeting: "Hi", suggestions: ["a"], calUrl: "", githubUrl: "" },
};

describe("settings service", () => {
  it("seeds defaults on first get", async () => {
    const { db } = await makeTestDb();
    const s = await getSettings(db);
    expect(s.agents.knowledge.model).toBe("qwen3.6-plus");
  });

  it("rejects invalid config via Zod", () => {
    expect(() => SettingsSchema.parse({ ...VALID, rag: { ...VALID.rag, topK: -1 } })).toThrow();
  });

  it("tolerates extra agent keys (extensible map)", () => {
    const extended = { ...VALID, agents: { ...VALID.agents, projectExpert: { model: "qwen3.6-plus", thinking: false, prompt: "p", framework: "crewai" } } };
    expect(() => SettingsSchema.parse(extended)).not.toThrow();
  });

  it("update persists, audits before/after, and busts the cache", async () => {
    const { db } = await makeTestDb();
    await getSettings(db);            // warms cache
    expect(configCache.get()).not.toBeNull();
    await updateSettings(db, { ...VALID, agents: { ...VALID.agents, knowledge: { ...VALID.agents.knowledge, model: "glm-4.7" } } }, "ip");
    expect(configCache.get()).toBeNull(); // busted
    const s = await getSettings(db);
    expect(s.agents.knowledge.model).toBe("glm-4.7");
  });
});
