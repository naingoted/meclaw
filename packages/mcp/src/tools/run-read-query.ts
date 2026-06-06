import { z } from "zod";
import { assertReadOnly } from "../guard";
import { redactRows } from "../redact";

export const runReadQueryInput = z.object({
  sql: z.string().min(1).describe("A single read-only SELECT or WITH...SELECT query"),
  limit: z.number().int().min(1).optional().describe("Max rows to return (capped server-side)"),
});

interface QueryDeps {
  /** postgres-js .unsafe(sql) — raw query on the read-only connection. */
  unsafe: (sql: string) => Promise<Array<Record<string, unknown>>>;
  rowCap: number;
  allowPii: boolean;
}

export interface QueryOut {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
}

export async function runReadQuery(
  args: z.infer<typeof runReadQueryInput>,
  deps: QueryDeps,
): Promise<QueryOut> {
  assertReadOnly(args.sql); // throws before any DB access
  const cap = Math.min(args.limit ?? deps.rowCap, deps.rowCap);
  const all = await deps.unsafe(args.sql);
  const truncated = all.length > cap;
  const rows = redactRows(all.slice(0, cap), deps.allowPii);
  return { rows, rowCount: rows.length, truncated };
}
