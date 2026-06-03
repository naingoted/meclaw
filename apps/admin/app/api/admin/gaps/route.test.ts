import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/request", () => ({
  clientIp: () => "ip",
  db: async () => ({}),
}));

vi.mock("@/lib/admin/gaps", async () => {
  const listClusters = vi.fn(async () => [{ id: "c1", exemplarQuery: "q", count: 3, status: "new", updatedAt: "t", reasons: { floor: 3 } }]);
  const getCluster = vi.fn(async () => ({ cluster: { id: "c1", exemplarQuery: "q" }, misses: [{ id: "m1" }] }));
  const resolveCluster = vi.fn(async () => {});
  const ignoreCluster = vi.fn(async () => {});
  return { listClusters, getCluster, resolveCluster, ignoreCluster, exportMissesCsv: vi.fn(async () => "h\n") };
});

import { GET } from "./route";
import { GET as GET_ONE, PATCH } from "./[id]/route";
import * as gapsMod from "@/lib/admin/gaps";

describe("gaps API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET lists clusters (default status=new)", async () => {
    const res = await GET(new Request("http://x/api/admin/gaps"));
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe("c1");
    expect(gapsMod.listClusters).toHaveBeenCalledWith({}, "new");
  });

  it("GET passes a status filter through", async () => {
    await GET(new Request("http://x/api/admin/gaps?status=resolved"));
    expect(gapsMod.listClusters).toHaveBeenCalledWith({}, "resolved");
  });

  it("GET /[id] returns the drill-in", async () => {
    const res = await GET_ONE(new Request("http://x/api/admin/gaps/c1"), { params: Promise.resolve({ id: "c1" }) });
    expect((await res.json()).cluster.id).toBe("c1");
  });

  it("PATCH resolve links the document", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/gaps/c1", { method: "PATCH", body: JSON.stringify({ action: "resolve", documentId: "d1" }) }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    expect(gapsMod.resolveCluster).toHaveBeenCalledWith({}, "c1", "d1", "ip");
  });

  it("PATCH ignore hides the cluster", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/gaps/c1", { method: "PATCH", body: JSON.stringify({ action: "ignore" }) }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    expect(gapsMod.ignoreCluster).toHaveBeenCalledWith({}, "c1", "ip");
  });

  it("PATCH 400 on resolve without documentId", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/gaps/c1", { method: "PATCH", body: JSON.stringify({ action: "resolve" }) }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(400);
  });
});
