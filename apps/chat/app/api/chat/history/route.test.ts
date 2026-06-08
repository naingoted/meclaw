import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@meclaw/core/db", () => ({
  initDb: vi.fn(async () => ({})),
  listConversationMessages: vi.fn(async (_db: unknown, convId: string, _limit: number) => {
    if (convId === "c-known") {
      return [
        { id: "m1", role: "user", content: "hello", createdAt: new Date(1) },
        { id: "m2", role: "assistant", content: "hi", createdAt: new Date(2) },
      ];
    }
    return [];
  }),
}));

vi.mock("@/lib/embed/auth", () => ({
  resolveEmbedClient: vi.fn(),
  isAllowedOrigin: vi.fn(),
  getChatDb: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/embed/resume", () => ({
  verifyResumeToken: vi.fn(),
}));

import { isAllowedOrigin, resolveEmbedClient } from "@/lib/embed/auth";
import { verifyResumeToken } from "@/lib/embed/resume";
import { GET } from "./route";

const client = {
  id: "e1",
  publicToken: "pk_a",
  name: "A",
  allowedOrigins: ["https://acme.com"],
  rateLimitPerMin: null,
  createdAt: new Date(),
  revokedAt: null,
};

function makeReq(search: string, origin = "https://acme.com") {
  return new Request(`http://localhost:3000/api/chat/history?${search}`, {
    headers: { origin },
  });
}

describe("GET /api/chat/history", () => {
  beforeEach(() => {
    vi.mocked(resolveEmbedClient).mockReset();
    vi.mocked(isAllowedOrigin).mockReset();
    vi.mocked(verifyResumeToken).mockReset();
  });

  it("returns 400 when required params are missing", async () => {
    const res = await GET(makeReq("embedToken=pk_a"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for unknown/revoked token", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue(null);
    const res = await GET(makeReq("embedToken=pk_x&conversationId=c-known&resumeToken=rt"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when origin is not in allowlist", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue(client);
    vi.mocked(isAllowedOrigin).mockReturnValue(false);
    const res = await GET(makeReq("embedToken=pk_a&conversationId=c-known&resumeToken=rt"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when resume token fails HMAC", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue(client);
    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(verifyResumeToken).mockReturnValue(false);
    const res = await GET(makeReq("embedToken=pk_a&conversationId=c-known&resumeToken=bad"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with messages when all checks pass", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue(client);
    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(verifyResumeToken).mockReturnValue(true);
    const res = await GET(makeReq("embedToken=pk_a&conversationId=c-known&resumeToken=rt"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      conversationId: "c-known",
      messages: [
        { id: "m1", role: "user", content: "hello" },
        { id: "m2", role: "assistant", content: "hi" },
      ],
    });
    // Verify the HMAC check was invoked with the right binding — a regression
    // that skipped the check or passed the wrong embedClientId would still
    // return 200 (mock returns true) but this assertion would catch it.
    expect(verifyResumeToken).toHaveBeenCalledWith({
      token: "rt",
      conversationId: "c-known",
      embedClientId: "e1",
    });
  });
});
