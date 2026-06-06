import { z } from "zod";
import type { ReadOnlySql } from "../db";

// fallow-ignore-next-line unused-export
export const getTelemetryInput = z.object({
  kind: z.enum(["gaps", "misses", "ingestion", "retrieval"]).describe("Which telemetry summary"),
});

interface TelemetryDeps {
  sql: ReadOnlySql;
  /** True if a table exists (used to degrade gracefully when Spec B is absent). */
  tableExists: (table: string) => Promise<boolean>;
}

export interface TelemetryOut {
  kind: string;
  available: boolean;
  rows?: Array<Record<string, unknown>>;
  notice?: string;
}

export async function getTelemetry(
  args: z.infer<typeof getTelemetryInput>,
  deps: TelemetryDeps,
): Promise<TelemetryOut> {
  if (args.kind === "retrieval" && !(await deps.tableExists("retrieval_events"))) {
    return {
      kind: "retrieval",
      available: false,
      notice: "retrieval telemetry not available — Spec B (retrieval_events) is not built yet.",
    };
  }
  const queries: Record<typeof args.kind, Promise<Array<Record<string, unknown>>>> = {
    misses: deps.sql`SELECT reason, count(*)::int AS n FROM chat_misses GROUP BY reason ORDER BY n DESC`,
    gaps: deps.sql`SELECT status, count(*)::int AS n FROM gap_clusters GROUP BY status ORDER BY n DESC`,
    ingestion: deps.sql`SELECT status, count(*)::int AS n FROM ingestion_jobs GROUP BY status`,
    retrieval: deps.sql`SELECT intent, count(*)::int AS n, avg("topScore")::float AS avg_top FROM retrieval_events GROUP BY intent`,
  };
  const rows = (await queries[args.kind]) as Array<Record<string, unknown>>;
  return { kind: args.kind, available: true, rows };
}
