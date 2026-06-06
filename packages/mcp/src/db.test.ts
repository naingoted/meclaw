import { describe, expect, it, vi } from "vitest";

const calls: Array<{ url: string; opts: unknown }> = [];
vi.mock("postgres", () => ({
  default: (url: string, opts: unknown) => {
    calls.push({ url, opts });
    return Object.assign(async () => [], { end: async () => {} });
  },
}));

import { makeReadOnlyClient } from "./db";

describe("makeReadOnlyClient", () => {
  it("builds a postgres client with a statement timeout from env", () => {
    const sql = makeReadOnlyClient({
      MCP_DATABASE_URL: "postgres://ro@localhost/meclaw",
      MCP_STATEMENT_TIMEOUT_MS: 5000,
    } as never);
    expect(typeof sql).toBe("function");
    expect(calls[0].url).toBe("postgres://ro@localhost/meclaw");
    expect(calls[0].opts).toMatchObject({ connection: { statement_timeout: 5000 } });
  });
});
