import { describe, expect, it } from "vitest";
import { parseDbEnv } from "./env";

describe("parseDbEnv", () => {
  it("parses a valid postgres URL", () => {
    const cfg = parseDbEnv({
      DATABASE_URL: "postgres://meclaw:meclaw@localhost:5432/meclaw",
    });
    expect(cfg.DATABASE_URL).toBe(
      "postgres://meclaw:meclaw@localhost:5432/meclaw",
    );
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => parseDbEnv({})).toThrow();
  });

  it("throws when DATABASE_URL is not a valid URL", () => {
    expect(() => parseDbEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("throws when DATABASE_URL is not a postgres URL", () => {
    expect(() =>
      parseDbEnv({ DATABASE_URL: "https://example.com/database" }),
    ).toThrow(/postgres/i);
  });
});
