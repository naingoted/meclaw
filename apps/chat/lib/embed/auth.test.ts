import { randomUUID } from "node:crypto";
import { embedClients } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { describe, expect, it, vi } from "vitest";
import type { EmbedClient } from "./auth";
import {
  frameAncestorsHeader,
  getChatAppOrigin,
  isAllowedOrigin,
  loadUnionAllowedOrigins,
  resolveEmbedClient,
  resolveVerifiedOrigin,
} from "./auth";

describe("resolveEmbedClient", () => {
  it("returns the client row for a live token", async () => {
    const { db } = await makeTestDb();
    const id = randomUUID();
    await db.insert(embedClients).values({
      id,
      publicToken: "pk_live",
      name: "Live",
      allowedOrigins: ["https://a.com"],
      rateLimitPerMin: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    const c = await resolveEmbedClient(db as never, "pk_live");
    expect(c).not.toBeNull();
    expect(c?.publicToken).toBe("pk_live");
    expect(c?.allowedOrigins).toEqual(["https://a.com"]);
  });

  it("returns null for an unknown token", async () => {
    const { db } = await makeTestDb();
    const c = await resolveEmbedClient(db as never, "pk_does-not-exist");
    expect(c).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const { db } = await makeTestDb();
    const id = randomUUID();
    await db.insert(embedClients).values({
      id,
      publicToken: "pk_revoked",
      name: "Revoked",
      allowedOrigins: [],
      rateLimitPerMin: null,
      createdAt: new Date(),
      revokedAt: new Date(),
    });
    const c = await resolveEmbedClient(db as never, "pk_revoked");
    expect(c).toBeNull();
  });

  it("returns null for a null token", async () => {
    const { db } = await makeTestDb();
    const c = await resolveEmbedClient(db as never, null);
    expect(c).toBeNull();
  });
});

const base: EmbedClient = {
  id: "c1",
  publicToken: "pk_abc",
  name: "Acme",
  allowedOrigins: ["https://acme.com", "https://staging.acme.com"],
  rateLimitPerMin: null,
  createdAt: new Date(0),
  revokedAt: null,
};

describe("isAllowedOrigin", () => {
  it("accepts an exact match", () => {
    expect(isAllowedOrigin(base, "https://acme.com")).toBe(true);
  });
  it("rejects a subdomain not in the list", () => {
    expect(isAllowedOrigin(base, "https://evil.acme.com")).toBe(false);
  });
  it("is scheme-sensitive", () => {
    expect(isAllowedOrigin(base, "http://acme.com")).toBe(false);
  });
  it("is port-sensitive", () => {
    expect(isAllowedOrigin(base, "https://acme.com:8080")).toBe(false);
  });
  it("rejects trailing-slash variations", () => {
    expect(isAllowedOrigin(base, "https://acme.com/")).toBe(false);
  });
});

describe("frameAncestorsHeader", () => {
  it("lists the client's allowed origins", () => {
    expect(frameAncestorsHeader(base)).toBe(
      "frame-ancestors https://acme.com https://staging.acme.com",
    );
  });
  it("returns 'none' when the allowlist is empty", () => {
    expect(frameAncestorsHeader({ ...base, allowedOrigins: [] })).toBe("frame-ancestors 'none'");
  });
  it("returns 'none' for a null client (unknown/revoked)", () => {
    expect(frameAncestorsHeader(null)).toBe("frame-ancestors 'none'");
  });
});

describe("getChatAppOrigin", () => {
  it("reads CHAT_APP_ORIGIN when set", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    expect(getChatAppOrigin()).toBe("http://localhost:3000");
    vi.unstubAllEnvs();
  });

  it("derives the origin from DOMAIN in production when CHAT_APP_ORIGIN is unset", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOMAIN", "chat.example.com");
    expect(getChatAppOrigin()).toBe("https://chat.example.com");
    vi.unstubAllEnvs();
  });

  it("falls back to localhost in dev when CHAT_APP_ORIGIN is unset", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getChatAppOrigin()).toBe("http://localhost:3000");
    vi.unstubAllEnvs();
  });
});

describe("resolveVerifiedOrigin", () => {
  it("uses the Origin header when cross-origin (differs from CHAT_APP_ORIGIN)", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    const req = new Request("http://localhost:3000/api/chat", {
      headers: { Origin: "http://localhost:3002" },
    });
    expect(resolveVerifiedOrigin(req, "https://forged.com")).toBe("http://localhost:3002");
    vi.unstubAllEnvs();
  });

  it("falls back to parentOrigin for same-origin iframe (Origin matches CHAT_APP_ORIGIN)", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    const req = new Request("http://localhost:3000/api/chat", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(resolveVerifiedOrigin(req, "https://parent.com")).toBe("https://parent.com");
    vi.unstubAllEnvs();
  });

  it("falls back to parentOrigin when Origin header is absent", () => {
    vi.stubEnv("CHAT_APP_ORIGIN", "http://localhost:3000");
    const req = new Request("http://localhost:3000/api/chat");
    expect(resolveVerifiedOrigin(req, "https://parent.com")).toBe("https://parent.com");
    vi.unstubAllEnvs();
  });
});

describe("loadUnionAllowedOrigins", () => {
  it("returns the union of all non-revoked clients' allowedOrigins", async () => {
    const { db } = await makeTestDb();
    await db.insert(embedClients).values([
      {
        id: randomUUID(),
        publicToken: "pk_a",
        name: "A",
        allowedOrigins: ["http://localhost:3002", "https://a.com"],
        rateLimitPerMin: null,
        createdAt: new Date(),
        revokedAt: null,
      },
      {
        id: randomUUID(),
        publicToken: "pk_b",
        name: "B",
        allowedOrigins: ["http://localhost:8080"],
        rateLimitPerMin: null,
        createdAt: new Date(),
        revokedAt: null,
      },
      {
        id: randomUUID(),
        publicToken: "pk_revoked",
        name: "Revoked",
        allowedOrigins: ["https://evil.com"],
        rateLimitPerMin: null,
        createdAt: new Date(),
        revokedAt: new Date(),
      },
    ]);
    const union = await loadUnionAllowedOrigins(db as never);
    expect(union).toEqual(
      expect.arrayContaining(["http://localhost:3002", "https://a.com", "http://localhost:8080"]),
    );
    expect(union).not.toContain("https://evil.com");
  });
});
