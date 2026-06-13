import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRateLimiterCheck = vi.fn(() => ({ allowed: true }));
const mockGlobalRateLimiterCheck = vi.fn(() => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({
  chatRateLimiter: { check: mockRateLimiterCheck },
  chatGlobalRateLimiter: { check: mockGlobalRateLimiterCheck },
}));

vi.mock("@/lib/embed/rate-limit", () => ({
  embedClientRateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock("@/lib/embed/resume", () => ({
  signResumeToken: vi.fn(),
  verifyResumeToken: vi.fn(() => false),
}));

vi.mock("@meclaw/core/db", () => ({
  initDb: vi.fn(async () => ({})),
  saveTurn: vi.fn(async () => {}),
  saveLead: vi.fn(async () => {}),
  saveMiss: vi.fn(async () => {}),
  saveRetrievalEvent: vi.fn(async () => {}),
  listConversationMessages: vi.fn(async () => []),
  configSnapshot: vi.fn(async () => ({})),
}));

vi.mock("@meclaw/core/settings", () => ({
  configSnapshot: vi.fn(async () => ({})),
}));

const mockResolveEmbedClient = vi.fn();
const mockIsAllowedOrigin = vi.fn();
const mockLoadUnionAllowedOrigins = vi.fn();
const mockGetChatDb = vi.fn(() => Promise.resolve({}));

vi.mock("@/lib/embed/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embed/auth")>();
  return {
    ...actual,
    resolveEmbedClient: (...args: unknown[]) => mockResolveEmbedClient(...args),
    isAllowedOrigin: (...args: unknown[]) => mockIsAllowedOrigin(...args),
    loadUnionAllowedOrigins: (...args: unknown[]) => mockLoadUnionAllowedOrigins(...args),
    getChatDb: () => mockGetChatDb(),
  };
});

const mockGetCachedUnionOrigins = vi.fn();
const mockSetCachedUnionOrigins = vi.fn();

vi.mock("@meclaw/core/embed-cache", () => ({
  getCachedUnionOrigins: () => mockGetCachedUnionOrigins(),
  setCachedUnionOrigins: (origins: string[]) => mockSetCachedUnionOrigins(origins),
}));

describe("OPTIONS /api/chat — CORS preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    mockGetCachedUnionOrigins.mockReturnValue(["http://localhost:3002", "http://localhost:8080"]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("echoes CORS headers for an allowlisted Origin", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("content-type");
    expect(res.headers.get("Access-Control-Max-Age")).toBeTruthy();
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("blocks a non-allowlisted Origin", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/chat", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.com" },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("loads union origins from DB on cache miss", async () => {
    mockGetCachedUnionOrigins.mockReturnValue(null);
    mockLoadUnionAllowedOrigins.mockResolvedValue(["http://localhost:3002"]);
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(mockLoadUnionAllowedOrigins).toHaveBeenCalled();
    expect(mockSetCachedUnionOrigins).toHaveBeenCalledWith(["http://localhost:3002"]);
    expect(res.status).toBe(204);
  });
});

describe("POST /api/chat — cross-origin Origin verification", () => {
  const client = {
    id: "e1",
    publicToken: "pk_a",
    name: "Local leanior",
    allowedOrigins: ["http://localhost:3002"],
    rateLimitPerMin: null,
    createdAt: new Date(),
    revokedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    mockRateLimiterCheck.mockReturnValue({ allowed: true });
    mockGlobalRateLimiterCheck.mockReturnValue({ allowed: true });
    mockResolveEmbedClient.mockResolvedValue(client);
    globalThis.fetch = vi.fn(
      async () =>
        new Response('data: {"type":"text-delta","delta":"ok"}\ndata: [DONE]\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    ) as never;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts valid token + allowlisted cross-origin Origin header", async () => {
    mockIsAllowedOrigin.mockReturnValue(true);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "http://localhost:3002",
        },
        body: JSON.stringify({
          embedToken: "pk_a",
          parentOrigin: "https://forged.com",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockIsAllowedOrigin).toHaveBeenCalledWith(client, "http://localhost:3002");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("verifies the real Origin header and ignores a forged body parentOrigin", async () => {
    mockIsAllowedOrigin.mockImplementation((_c, origin) => origin === "http://localhost:3002");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "http://localhost:3002",
        },
        body: JSON.stringify({
          embedToken: "pk_a",
          parentOrigin: "https://forged.com",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockIsAllowedOrigin).not.toHaveBeenCalledWith(client, "https://forged.com");
  });

  it("includes CORS headers on 403 embed rejection", async () => {
    mockResolveEmbedClient.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "http://localhost:3002",
        },
        body: JSON.stringify({
          embedToken: "pk_bad",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
  });

  it("includes CORS headers on 429 rate limit", async () => {
    mockRateLimiterCheck.mockReturnValue({
      allowed: false,
      retryAfter: 30,
    } as ReturnType<typeof mockRateLimiterCheck>);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "http://localhost:3002",
        },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});
