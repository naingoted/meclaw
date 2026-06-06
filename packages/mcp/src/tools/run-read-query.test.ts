import { describe, expect, it, vi } from "vitest";
import { runReadQuery } from "./run-read-query";

describe("runReadQuery", () => {
  it("rejects non-SELECT via the guard before touching the db", async () => {
    const unsafe = vi.fn();
    await expect(
      runReadQuery(
        { sql: "DELETE FROM leads" },
        { unsafe: unsafe as never, rowCap: 100, allowPii: false },
      ),
    ).rejects.toThrow(/read-only/i);
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("runs a SELECT, caps rows, and redacts PII when allowPii=false", async () => {
    const unsafe = vi.fn(async () => [
      { id: "1", email: "a@b.com" },
      { id: "2", email: "c@d.com" },
    ]);
    const out = await runReadQuery(
      { sql: "SELECT id, email FROM leads", limit: 1 },
      { unsafe: unsafe as never, rowCap: 100, allowPii: false },
    );
    expect(out.rows).toEqual([{ id: "1", email: "[redacted]" }]);
    expect(out.truncated).toBe(true);
  });
});
