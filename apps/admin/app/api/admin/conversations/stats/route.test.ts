import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ clientIp: () => "ip", db: async () => ({}) }));
vi.mock("@/lib/admin/conversations", () => ({
  conversationStats: vi.fn(async () => ({ total: 12, gapRatePct: 25, avgTurns: 3.2 })),
}));

import { GET } from "./route";

describe("conversation stats API", () => {
  it("returns computed stats", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 12, gapRatePct: 25, avgTurns: 3.2 });
  });
});
