import { embedderFromEnv, storeFromEnv } from "@meclaw/rag";
import { makeReadOnlyClient } from "./db";
import { parseMcpEnv } from "./env";
import type { ServerDeps } from "./registry";

export function buildDeps(): ServerDeps {
  const env = parseMcpEnv();
  const sql = makeReadOnlyClient(env);
  return {
    embedder: embedderFromEnv(),
    store: storeFromEnv(),
    sql,
    env,
    tableExists: async (table: string) => {
      const rows =
        (await sql`SELECT to_regclass(${"public." + table}) IS NOT NULL AS ok`) as Array<{
          ok: boolean;
        }>;
      return rows[0]?.ok ?? false;
    },
  };
}
