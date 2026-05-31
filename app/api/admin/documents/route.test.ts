import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/request", () => ({
  adminGuard: () => null,
  clientIp: () => "ip",
  db: async () => ({}),
}));

const created = { id: "d1", title: "A" };
vi.mock("@/lib/admin/documents", () => ({
  listDocuments: vi.fn(async () => [{ id: "d1", title: "A", status: "draft" }]),
  createDocument: vi.fn(async () => created),
}));

import { GET, POST } from "./route";

describe("documents API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET lists documents", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe("d1");
  });

  it("POST validates and creates", async () => {
    const res = await POST(
      new Request("http://x/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ title: "A", body: "x" }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("POST 400 on missing title", async () => {
    const res = await POST(
      new Request("http://x/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ body: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
