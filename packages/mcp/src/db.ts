import postgres from "postgres";
import type { McpEnv } from "./env";

/**
 * A postgres-js client bound to the read-only role (MCP_DATABASE_URL points at
 * meclaw_ro). Sets a per-connection statement_timeout as a runaway guard. The
 * role itself (GRANT SELECT only) is the hard read-only guarantee; the guard in
 * guard.ts is defense-in-depth above this.
 */
export function makeReadOnlyClient(env: McpEnv) {
  return postgres(env.MCP_DATABASE_URL, {
    max: 4,
    connection: { statement_timeout: env.MCP_STATEMENT_TIMEOUT_MS },
  });
}

// fallow-ignore-next-line unused-type
export type ReadOnlySql = ReturnType<typeof makeReadOnlyClient>;
