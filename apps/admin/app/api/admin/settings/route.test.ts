import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));
const value = {
  agents: {
    triage: { model: "glm-4.7", thinking: false, prompt: "t" },
    knowledge: { model: "qwen3.6-plus", thinking: false, prompt: "k" },
    scheduler: { model: "qwen3.6-plus", thinking: false, prompt: "s" },
    contact: { model: "qwen3.6-plus", thinking: false, prompt: "c" },
  },
  shared: { persona: "" },
  rag: { topK: 4, scoreThreshold: 0, tinyCorpusThreshold: 8000 },
  public: { greeting: "Hi", suggestions: [], calUrl: "", githubUrl: "" },
};
vi.mock("@meclaw/core/settings", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getSettings: vi.fn(async () => value),
    updateSettings: vi.fn(async (_db, v) => v),
  };
});

import { GET, PUT } from "./route";

describe("settings API", () => {
  beforeEach(() => vi.clearAllMocks());
  it("GET returns settings", async () => {
    expect((await GET()).status).toBe(200);
  });
  it("PUT 400 on invalid body", async () => {
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ ...value, rag: { ...value.rag, topK: -5 } }),
      }),
    );
    expect(res.status).toBe(400);
  });
  it("PUT 200 on valid body", async () => {
    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(value) }));
    expect(res.status).toBe(200);
  });
});
