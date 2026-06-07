import { describe, expect, it } from "vitest";
import { assertReadOnly } from "./guard";

describe("assertReadOnly", () => {
  it("accepts a plain SELECT", () => {
    expect(() => assertReadOnly("SELECT id FROM leads")).not.toThrow();
  });

  it("accepts a WITH ... SELECT (CTE)", () => {
    expect(() => assertReadOnly("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow();
  });

  it("rejects INSERT/UPDATE/DELETE/DDL", () => {
    for (const sql of [
      "INSERT INTO leads (id) VALUES ('x')",
      "UPDATE leads SET email='a'",
      "DELETE FROM leads",
      "DROP TABLE leads",
      "ALTER TABLE leads ADD COLUMN x text",
    ]) {
      expect(() => assertReadOnly(sql), sql).toThrow(/read-only/i);
    }
  });

  it("rejects multiple statements", () => {
    expect(() => assertReadOnly("SELECT 1; DELETE FROM leads")).toThrow(/single/i);
  });
});
