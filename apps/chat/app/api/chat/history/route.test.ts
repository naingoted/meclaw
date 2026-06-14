import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@meclaw/core/db", () => ({
  initDb: vi.fn(async () => ({})),
  listConversationMessages: vi.fn(async (_db: unknown, convId: string) => {
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

const checkPublicApiLimit = vi.fn((_: Request, _scope: string): Response | null => null);

vi.mock("@/lib/public-api-rate-limit", () => ({
  checkPublicApiLimit: (req: Request, scope: string) => checkPublicApiLimit(req, scope),
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

function makeReq(search: string, parentOrigin: string | null = "https://acme.com") {
  const qs =
    parentOrigin === null ? search : `${search}&parentOrigin=${encodeURIComponent(parentOrigin)}`;
  return new Request(`http://localhost:3000/api/chat/history?${qs}`);
}

describe("GET /api/chat/history", () => {
  beforeEach(() => {
    checkPublicApiLimit.mockReset();
    checkPublicApiLimit.mockReturnValue(null);
    vi.mocked(resolveEmbedClient).mockReset();
    vi.mocked(isAllowedOrigin).mockReset();
    vi.mocked(verifyResumeToken).mockReset();
  });

  it("429s before token verification when the public API limiter rejects", async () => {
    checkPublicApiLimit.mockReturnValue(
      Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );

    const res = await GET(makeReq("conversationId=c-known&resumeToken=rt", null));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(verifyResumeToken).not.toHaveBeenCalled();
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

  it("returns 403 when parentOrigin is not in allowlist", async () => {
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
        { id: "m1", role: "user", content: "hello", createdAt: new Date(1).toISOString() },
        { id: "m2", role: "assistant", content: "hi", createdAt: new Date(2).toISOString() },
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

  describe("first-party (main chat) path — no embedToken", () => {
    it("returns 200 + messages for a valid HMAC under the __main__ sentinel", async () => {
      vi.mocked(verifyResumeToken).mockReturnValue(true);

      const res = await GET(makeReq("conversationId=c-known&resumeToken=rt", null));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        conversationId: "c-known",
        messages: [
          { id: "m1", role: "user", content: "hello", createdAt: new Date(1).toISOString() },
          { id: "m2", role: "assistant", content: "hi", createdAt: new Date(2).toISOString() },
        ],
      });
      // HMAC must be checked against the virtual sentinel, not an embed client id.
      expect(verifyResumeToken).toHaveBeenCalledWith({
        token: "rt",
        conversationId: "c-known",
        embedClientId: "__main__",
      });
      // No embed-client resolution on the first-party path.
      expect(resolveEmbedClient).not.toHaveBeenCalled();
    });

    it("returns 401 when the resume token fails HMAC", async () => {
      vi.mocked(verifyResumeToken).mockReturnValue(false);

      const res = await GET(makeReq("conversationId=c-known&resumeToken=bad", null));

      expect(res.status).toBe(401);
    });

    it("returns 400 when conversationId or resumeToken is missing", async () => {
      const res = await GET(makeReq("resumeToken=rt", null));

      expect(res.status).toBe(400);
    });
  });
});
