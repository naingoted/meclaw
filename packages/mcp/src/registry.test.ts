import { describe, expect, it } from "vitest";
import { buildServer } from "./registry";
import { toolsForScope } from "./scope";

// Minimal fake deps; registry must not touch the DB at registration time.
const deps = {
  embedder: { embed: async () => [0] },
  store: {
    ensureCollection: async () => {},
    upsert: async () => {},
    deleteBySource: async () => {},
    search: async () => [],
  },
  sql: (async () => []) as never,
  tableExists: async () => false,
  env: { MCP_ALLOW_PII: false, MCP_ROW_CAP: 100 } as never,
};

describe("buildServer", () => {
  it("registers only public-scope tools for the public scope", async () => {
    const { listToolNames } = buildServer("public", deps);
    const names = listToolNames();
    expect(new Set(names)).toEqual(new Set(toolsForScope("public")));
    expect(names).not.toContain("run_read_query");
  });

  it("registers operator tools for the operator scope", async () => {
    const { listToolNames } = buildServer("operator", deps);
    expect(listToolNames()).toContain("run_read_query");
  });
});
