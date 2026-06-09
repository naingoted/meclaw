import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({
  clientIp: () => "ip",
  db: async () => ({}),
}));

vi.mock("@/lib/admin/embed-clients", () => ({
  updateEmbedClient: vi.fn(async (_db: unknown, id: string, patch: Record<string, unknown>) => ({
    id,
    publicToken: "pk_a",
    name: (patch.name as string) ?? "A",
    allowedOrigins: (patch.allowedOrigins as string[]) ?? [],
    rateLimitPerMin: (patch.rateLimitPerMin as number | null) ?? null,
    createdAt: new Date(0),
    revokedAt: null,
  })),
  revokeEmbedClient: vi.fn(async () => {}),
}));

import * as lib from "@/lib/admin/embed-clients";
import { DELETE, PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "e1" }) };

describe("PATCH /api/admin/embed-clients/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates allowedOrigins", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/embed-clients/e1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedOrigins: ["https://x.com"] }),
      }),
      { params: ctx.params },
    );
    expect(res.status).toBe(200);
    expect(lib.updateEmbedClient).toHaveBeenCalledWith(
      expect.anything(),
      "e1",
      { allowedOrigins: ["https://x.com"] },
      "ip",
    );
  });

  it("rejects a malformed origin in the patch", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/embed-clients/e1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedOrigins: ["not a url"] }),
      }),
      { params: ctx.params },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when nothing is being updated", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/embed-clients/e1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: ctx.params },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/embed-clients/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes the client and returns 204", async () => {
    const res = await DELETE(
      new Request("http://x/api/admin/embed-clients/e1", { method: "DELETE" }),
      { params: ctx.params },
    );
    expect(res.status).toBe(204);
    expect(lib.revokeEmbedClient).toHaveBeenCalledWith(expect.anything(), "e1", "ip");
  });
});
