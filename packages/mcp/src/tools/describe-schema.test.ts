import { describe, expect, it, vi } from "vitest";
import { describeSchema } from "./describe-schema";

function fakeSql(rows: unknown[]) {
  return vi.fn(async () => rows) as never;
}

describe("describeSchema", () => {
  it("returns tables with columns and row counts", async () => {
    const sql = fakeSql([
      { table_name: "leads", column_name: "id", data_type: "text" },
      { table_name: "leads", column_name: "email", data_type: "text" },
    ]);
    const counts = fakeSql([{ table_name: "leads", n: 3 }]);
    const out = await describeSchema({}, { sql, countSql: counts });
    expect(out.tables.leads.columns).toEqual([
      { name: "id", type: "text" },
      { name: "email", type: "text" },
    ]);
    expect(out.tables.leads.rowCount).toBe(3);
  });
});
