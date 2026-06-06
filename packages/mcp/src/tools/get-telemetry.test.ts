import { describe, expect, it, vi } from "vitest";
import { getTelemetry } from "./get-telemetry";

describe("getTelemetry", () => {
  it("summarizes misses", async () => {
    const sql = vi.fn(async () => [{ reason: "floor", n: 4 }]) as never;
    const out = await getTelemetry({ kind: "misses" }, { sql, tableExists: async () => true });
    expect(out.kind).toBe("misses");
    expect(out.rows).toEqual([{ reason: "floor", n: 4 }]);
  });

  it("returns a graceful notice when retrieval_events is absent (Spec B not built)", async () => {
    const sql = vi.fn() as never;
    const out = await getTelemetry({ kind: "retrieval" }, { sql, tableExists: async () => false });
    expect(out.available).toBe(false);
    expect(out.notice).toMatch(/not available/i);
  });
});
