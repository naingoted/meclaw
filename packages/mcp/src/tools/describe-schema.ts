import { z } from "zod";
import type { ReadOnlySql } from "../db";

export const describeSchemaInput = z.object({
  table: z.string().optional().describe("Optional: restrict to one table"),
});

interface SchemaDeps {
  /** Returns columns: {table_name, column_name, data_type} from information_schema. */
  sql: ReadOnlySql;
  /** Returns {table_name, n} row counts. */
  countSql: ReadOnlySql;
}

export interface SchemaOut {
  tables: Record<string, { columns: Array<{ name: string; type: string }>; rowCount: number }>;
}

export async function describeSchema(
  args: z.infer<typeof describeSchemaInput>,
  deps: SchemaDeps,
): Promise<SchemaOut> {
  const cols = (await deps.sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      ${args.table ? deps.sql`AND table_name = ${args.table}` : deps.sql``}
    ORDER BY table_name, ordinal_position
  `) as Array<{ table_name: string; column_name: string; data_type: string }>;

  const counts = (await deps.countSql`
    SELECT relname AS table_name, n_live_tup AS n
    FROM pg_stat_user_tables
  `) as Array<{ table_name: string; n: number }>;

  const countMap = new Map(counts.map((c) => [c.table_name, Number(c.n)]));
  const tables: SchemaOut["tables"] = {};
  for (const row of cols) {
    // biome-ignore lint/suspicious/noAssignInExpressions: lazy map-entry init via logical assignment
    (tables[row.table_name] ??= {
      columns: [],
      rowCount: countMap.get(row.table_name) ?? 0,
    }).columns.push({ name: row.column_name, type: row.data_type });
  }
  return { tables };
}
