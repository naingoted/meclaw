import { DEFAULT_PUBLIC_COPY } from "@meclaw/core/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveEmbedClient = vi.fn();
const mockIsAllowedOrigin = vi.fn();
const mockLoadUnionAllowedOrigins = vi.fn();
const mockGetChatDb = vi.fn(() => Promise.resolve({}));
const mockGetSettings = vi.fn();
const mockGetSettingsVersion = vi.fn();
const mockCheckPublicApiLimit = vi.fn((_: Request, _scope: string): Response | null => null);

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

vi.mock("@meclaw/core/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@meclaw/core/settings")>();
  return {
    ...actual,
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    getSettingsVersion: (...args: unknown[]) => mockGetSettingsVersion(...args),
  };
});

vi.mock("@/lib/version", () => ({
  VERSION_LABEL: "meclaw · v9.9.9 · deadbeef",
}));

vi.mock("@/lib/public-api-rate-limit", () => ({
  checkPublicApiLimit: (req: Request, scope: string) => mockCheckPublicApiLimit(req, scope),
}));

const client = {
  id: "e1",
  publicToken: "pk_a",
  name: "Local leanior",
  allowedOrigins: ["http://localhost:3002"],
  rateLimitPerMin: null,
  createdAt: new Date(),
  revokedAt: null,
};

const publicSettings = {
  agents: {},
  shared: { persona: "" },
  rag: {
    topK: 4,
    scoreThreshold: 0,
    gapMatchThreshold: 0.15,
    scoreFloor: 0.35,
    clusterRadius: 0.15,
  },
  public: {
    greeting: "Hi from admin",
    suggestions: ["One", "Two"],
    calUrl: "",
    githubUrl: "",
    contactEmail: "test@example.com",
    botName: "meclaw",
    botTagline: "",
    brandLogoUrl: "",
    brandAccent: "",
    copy: DEFAULT_PUBLIC_COPY,
  },
};

describe("OPTIONS /api/embed-config — CORS preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    mockCheckPublicApiLimit.mockReturnValue(null);
    mockGetCachedUnionOrigins.mockReturnValue(["http://localhost:3002"]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("echoes CORS headers for an allowlisted Origin", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/embed-config", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("blocks a non-allowlisted Origin", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/embed-config", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.com" },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/embed-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    mockCheckPublicApiLimit.mockReturnValue(null);
    mockResolveEmbedClient.mockResolvedValue(client);
    mockIsAllowedOrigin.mockReturnValue(true);
    mockGetSettings.mockResolvedValue(publicSettings);
    mockGetSettingsVersion.mockResolvedValue("2026-06-03T01:02:03.000Z");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function configUrl(params: Record<string, string> = {}) {
    const search = new URLSearchParams({
      embedToken: "pk_a",
      parentOrigin: "http://localhost:3002",
      ...params,
    });
    return `http://localhost:3000/api/embed-config?${search.toString()}`;
  }

  it("returns public embed config with version label and no-store caching", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request(configUrl(), {
        headers: { Origin: "http://localhost:3002" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
    await expect(res.json()).resolves.toEqual({
      version: "2026-06-03T01:02:03.000Z",
      versionLabel: "meclaw · v9.9.9 · deadbeef",
      greeting: "Hi from admin",
      suggestions: ["One", "Two"],
      botName: "meclaw",
      brandLogoUrl: "",
      brandAccent: "",
      copy: DEFAULT_PUBLIC_COPY,
    });
    expect(mockIsAllowedOrigin).toHaveBeenCalledWith(client, "http://localhost:3002");
  });

  it("429s before DB work when the public API limiter rejects", async () => {
    mockCheckPublicApiLimit.mockReturnValue(
      Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );
    const { GET } = await import("./route");

    const res = await GET(
      new Request(configUrl(), {
        headers: { Origin: "http://localhost:3002" },
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(mockGetChatDb).not.toHaveBeenCalled();
  });

  it("400s when embedToken is missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost:3000/api/embed-config?parentOrigin=http://localhost:3002", {
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403s for unknown embed token with CORS headers", async () => {
    mockResolveEmbedClient.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      new Request(configUrl(), {
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3002");
  });

  it("403s when parent origin is not allowlisted", async () => {
    mockIsAllowedOrigin.mockReturnValue(false);
    const { GET } = await import("./route");
    const res = await GET(
      new Request(configUrl(), {
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when settings cannot be loaded", async () => {
    mockGetSettings.mockRejectedValue(new Error("db down"));
    const { GET } = await import("./route");
    const res = await GET(
      new Request(configUrl(), {
        headers: { Origin: "http://localhost:3002" },
      }),
    );
    expect(res.status).toBe(503);
  });
});
