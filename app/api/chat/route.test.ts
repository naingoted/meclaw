import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the provider so no live gateway is touched.
vi.mock("@/lib/ai/provider", () => ({
  getModel: () => "mock-model",
}));

// Mock the AI SDK: capture streamText args, return a streamable response.
const streamTextMock = vi.fn((args: unknown) => {
  void args; // captured via mock.calls; referenced to satisfy lint
  return {
    toUIMessageStreamResponse: () => new Response("stream", { status: 200 }),
  };
});
vi.mock("ai", () => ({
  streamText: (args: unknown) => streamTextMock(args),
  convertToModelMessages: (messages: unknown) => messages,
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => streamTextMock.mockClear());

  it("streams a response built from the posted messages and a system prompt", async () => {
    const messages = [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }];

    const res = await POST(makeRequest({ messages }));

    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const args = streamTextMock.mock.calls[0][0] as {
      model: unknown;
      system: string;
      messages: unknown;
    };
    expect(args.model).toBe("mock-model");
    expect(typeof args.system).toBe("string");
    expect(args.system.length).toBeGreaterThan(0);
    expect(args.messages).toEqual(messages);
  });
});
