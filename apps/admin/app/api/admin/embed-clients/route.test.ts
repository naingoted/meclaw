import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({
  clientIp: () => "ip",
  db: async () => ({}),
}));

vi.mock("@/lib/admin/embed-clients", () => {
  const listEmbedClients = vi.fn(async () => [
    {
      id: "e1",
      publicToken: "pk_a",
      name: "A",
      allowedOrigins: ["https://a.com"],
      rateLimitPerMin: null,
      createdAt: new Date(0),
      revokedAt: null,
    },
  ]);
  const createEmbedClient = vi.fn(
    async (
      _db: unknown,
      input: { name: string; allowedOrigins: string[]; rateLimitPerMin?: number | null },
    ) => ({
      id: "e-new",
      publicToken: "pk_new",
      name: input.name,
      allowedOrigins: input.allowedOrigins,
      rateLimitPerMin: input.rateLimitPerMin ?? null,
      createdAt: new Date(0),
      revokedAt: null,
    }),
  );
  return { listEmbedClients, createEmbedClient };
});

import * as lib from "@/lib/admin/embed-clients";
import { GET, POST } from "./route";

describe("GET /api/admin/embed-clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the list", async () => {
    const res = await GET(new Request("http://x/api/admin/embed-clients"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].publicToken).toBe("pk_a");
    expect(lib.listEmbedClients).toHaveBeenCalled();
  });
});

describe("POST /api/admin/embed-clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an empty name", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "", allowedOrigins: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed origin", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", allowedOrigins: ["not a url"] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive rate limit", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", allowedOrigins: [], rateLimitPerMin: 0 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates and returns 201 with the new row", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme", allowedOrigins: ["https://acme.com"] }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.publicToken).toBe("pk_new");
    expect(body.name).toBe("Acme");
    expect(lib.createEmbedClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "Acme", allowedOrigins: ["https://acme.com"] }),
      "ip",
    );
  });

  it("passes rateLimitPerMin through when supplied", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "A",
          allowedOrigins: [],
          rateLimitPerMin: 120,
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(lib.createEmbedClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rateLimitPerMin: 120 }),
      "ip",
    );
  });

  it("rejects malformed JSON body", async () => {
    const res = await POST(
      new Request("http://x/api/admin/embed-clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
