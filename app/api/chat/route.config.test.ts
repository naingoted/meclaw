import { describe, it, expect, vi, beforeEach } from "vitest";

const snapshot = {
  agents: {
    triage: { model: "glm-4.7", thinking: false, prompt: "" },
    knowledge: { model: "qwen3.6-plus", thinking: false, prompt: "" },
  },
  shared: { persona: "" },
  rag: { topK: 4 },
};

vi.mock("@/lib/admin/config-snapshot", () => ({
  configSnapshot: vi.fn(async () => snapshot),
}));

vi.mock("@/lib/db", () => ({
  initDb: async () => ({}),
  saveTurn: async () => "c1",
}));

vi.mock("@/lib/rate-limit", () => ({
  chatRateLimiter: { check: () => ({ allowed: true }) },
}));

vi.mock("@/lib/ai/guardrails", () => ({
  detectInjection: () => false,
}));

describe("chat route forwards config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes the config snapshot in the sidecar request body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("data: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    await POST(
      new Request("http://x/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      })
    );

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.config.agents.knowledge.model).toBe("qwen3.6-plus");
  });
});
