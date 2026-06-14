import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));

const listConversations = vi.hoisted(() =>
  vi.fn(async () => ({ items: [{ id: "c1" }], nextCursor: null })),
);
vi.mock("@/lib/admin/conversations", () => ({ listConversations }));

import { GET } from "./route";

describe("conversations list API", () => {
  beforeEach(() => listConversations.mockClear());

  it("defaults to the last 7 days and returns items", async () => {
    const res = await GET(new Request("http://x/api/admin/conversations"));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].id).toBe("c1");
    const opts = listConversations.mock.calls[0][1] as { from: Date; to: Date };
    expect(opts.to.getTime() - opts.from.getTime()).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -5);
  });

  it("passes outcome, q and cursor through", async () => {
    await GET(
      new Request("http://x/api/admin/conversations?outcome=gap&q=rust&cursor=abc&limit=10"),
    );
    const opts = listConversations.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.outcome).toBe("gap");
    expect(opts.q).toBe("rust");
    expect(opts.cursor).toBe("abc");
    expect(opts.limit).toBe(10);
  });

  it("ignores a bad outcome value", async () => {
    await GET(new Request("http://x/api/admin/conversations?outcome=bogus"));
    const opts = listConversations.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.outcome).toBeUndefined();
  });
});
