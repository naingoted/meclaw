import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));
const exportConversationsJsonl = vi.hoisted(() => vi.fn(async () => '{"id":"c1"}'));
vi.mock("@/lib/admin/conversations", () => ({ exportConversationsJsonl }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/conversations/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("conversations export API", () => {
  beforeEach(() => exportConversationsJsonl.mockClear());

  it("returns a JSONL attachment for valid ids", async () => {
    const res = await POST(req({ ids: ["c1"] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(await res.text()).toBe('{"id":"c1"}');
  });

  it("400s on an empty id list", async () => {
    const res = await POST(req({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400s when more than 50 ids are requested", async () => {
    const res = await POST(req({ ids: Array.from({ length: 51 }, (_, i) => `c${i}`) }));
    expect(res.status).toBe(400);
  });
});
