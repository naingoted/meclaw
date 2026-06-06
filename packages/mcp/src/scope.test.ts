import { describe, expect, it } from "vitest";
import { SCOPES, toolsForScope, type Scope } from "./scope";

describe("scope", () => {
  it("public scope excludes raw SQL, schema, and telemetry tools", () => {
    const names = toolsForScope("public");
    expect(names).toContain("search_corpus");
    expect(names).toContain("owner_contact");
    expect(names).not.toContain("run_read_query");
    expect(names).not.toContain("describe_schema");
    expect(names).not.toContain("get_telemetry");
  });

  it("operator scope is a superset including introspection tools", () => {
    const names = toolsForScope("operator");
    expect(names).toContain("search_corpus");
    expect(names).toContain("run_read_query");
    expect(names).toContain("describe_schema");
    expect(names).toContain("get_telemetry");
  });

  it("declares exactly the two scopes", () => {
    expect(SCOPES).toEqual<Scope[]>(["public", "operator"]);
  });
});
