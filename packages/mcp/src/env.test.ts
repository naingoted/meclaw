import { describe, expect, it } from "vitest";
import { parseMcpEnv } from "./env";

describe("parseMcpEnv", () => {
  it("parses a valid env with defaults", () => {
    const env = parseMcpEnv({ MCP_DATABASE_URL: "postgres://ro@localhost/meclaw" });
    expect(env.MCP_DATABASE_URL).toBe("postgres://ro@localhost/meclaw");
    expect(env.MCP_ALLOW_PII).toBe(false);
    expect(env.MCP_ROW_CAP).toBe(100);
  });

  it("coerces MCP_ALLOW_PII=true and row cap", () => {
    const env = parseMcpEnv({
      MCP_DATABASE_URL: "postgres://ro@localhost/meclaw",
      MCP_ALLOW_PII: "true",
      MCP_ROW_CAP: "250",
    });
    expect(env.MCP_ALLOW_PII).toBe(true);
    expect(env.MCP_ROW_CAP).toBe(250);
  });

  it("throws when MCP_DATABASE_URL is missing", () => {
    expect(() => parseMcpEnv({})).toThrow();
  });
});
