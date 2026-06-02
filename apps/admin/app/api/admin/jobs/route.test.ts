import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));

vi.mock("@/lib/admin/ingest-runner", () => ({
  enqueueSingle: vi.fn(async () => ({ id: "j1" })),
  enqueueAllDirty: vi.fn(async () => [{ id: "j1" }, { id: "j2" }]),
  listJobs: vi.fn(async () => [{ id: "j1", status: "queued" }]),
}));

import { GET, POST } from "./route";
import { enqueueSingle, enqueueAllDirty } from "@/lib/admin/ingest-runner";

describe("jobs API", () => {
  beforeEach(() => vi.clearAllMocks());
  it("GET lists jobs", async () => { expect((await GET()).status).toBe(200); });
  it("POST {documentId} enqueues a single job", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ documentId: "d1" }) }));
    expect(res.status).toBe(202); expect(enqueueSingle).toHaveBeenCalled();
  });
  it("POST {all:true} enqueues all dirty", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ all: true }) }));
    expect(res.status).toBe(202); expect(enqueueAllDirty).toHaveBeenCalled();
  });
});
