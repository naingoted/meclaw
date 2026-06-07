import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({
  clientIp: () => "ip",
  db: async () => ({}),
}));

vi.mock("@/lib/admin/documents", () => {
  const listDocuments = vi.fn(async () => [{ id: "d1", title: "A", status: "draft" }]);
  const createDocument = vi.fn(async (_db: unknown, input: { origin?: string }) => ({
    id: "d1",
    title: "A",
    origin: input.origin ?? "manual",
  }));
  return { listDocuments, createDocument };
});

import * as documentsMod from "@/lib/admin/documents";
import { GET, POST } from "./route";

describe("documents API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET lists documents", async () => {
    const res = await GET(new Request("http://x/api/admin/documents"));
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

  it("GET passes a valid ?origin= filter through to listDocuments", async () => {
    const res = await GET(new Request("http://x/api/admin/documents?origin=gap"));
    expect(res.status).toBe(200);
    expect(documentsMod.listDocuments).toHaveBeenCalledWith(expect.anything(), "gap");
  });

  it("GET 400 on an invalid origin filter", async () => {
    const res = await GET(new Request("http://x/api/admin/documents?origin=bogus"));
    expect(res.status).toBe(400);
  });

  it("POST persists origin:'gap' when supplied", async () => {
    const res = await POST(
      new Request("http://x/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ title: "A", body: "x", origin: "gap" }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).origin).toBe("gap");
  });

  it("POST 400 on an invalid origin", async () => {
    const res = await POST(
      new Request("http://x/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({ title: "A", body: "x", origin: "bogus" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
