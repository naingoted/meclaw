import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));

const getConversation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/conversations", () => ({ getConversation }));

import { GET } from "./route";

describe("conversation detail API", () => {
  beforeEach(() => getConversation.mockReset());

  it("returns the detail when found", async () => {
    getConversation.mockResolvedValue({
      conversation: { id: "c1", createdAt: "t" },
      messages: [],
      retrieval: {},
    });
    const res = await GET(new Request("http://x/api/admin/conversations/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).conversation.id).toBe("c1");
  });

  it("404s when the conversation does not exist (orphaned miss)", async () => {
    getConversation.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/admin/conversations/ghost"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});
