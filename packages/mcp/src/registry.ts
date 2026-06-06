import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmbeddingClient, VectorStoreClient } from "@meclaw/rag";
import type { McpEnv } from "./env";
import type { ReadOnlySql } from "./db";
import { type Scope, TOOL_SCOPES } from "./scope";
import { searchCorpus, searchCorpusInput } from "./tools/search-corpus";
import { ownerContact, scheduleCall, showResume, howThisWorks } from "./tools/static-tools";
import { describeSchema, describeSchemaInput } from "./tools/describe-schema";
import { runReadQuery, runReadQueryInput } from "./tools/run-read-query";
import { getTelemetry, getTelemetryInput } from "./tools/get-telemetry";
import { schemaDictionaryJson } from "./resources/schema-dictionary";
import { latestEvalReport } from "./resources/eval-report";

export interface ServerDeps {
  embedder: EmbeddingClient;
  store: VectorStoreClient;
  sql: ReadOnlySql;
  tableExists: (table: string) => Promise<boolean>;
  env: McpEnv;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

export function buildServer(scope: Scope, deps: ServerDeps) {
  const server = new McpServer({ name: "meclaw", version: "0.1.0" });
  const registered: string[] = [];
  const allow = (name: string) => {
    const scopes = TOOL_SCOPES[name];
    if (!scopes) throw new Error(`Unknown tool: ${name}. Add it to TOOL_SCOPES in scope.ts.`);
    return scopes.includes(scope);
  };

  const add = (
    name: string,
    config: any,
    handler: any,
  ) => {
    if (!allow(name)) return;
    server.registerTool(name, config, handler);
    registered.push(name);
  };

  add("search_corpus", { description: "Semantic search over the knowledge corpus", inputSchema: searchCorpusInput.shape }, async (args: any) =>
    text(await searchCorpus(args, deps)),
  );
  add("owner_contact", { description: "Owner's public contact info", inputSchema: {} }, async () =>
    text(ownerContact(process.env)),
  );
  add("schedule_call", { description: "Booking link to schedule a call", inputSchema: {} }, async () =>
    text(scheduleCall(process.env)),
  );
  add("show_resume", { description: "Resume download link", inputSchema: {} }, async () =>
    text(showResume()),
  );
  add("how_this_works", { description: "Explain what meclaw is", inputSchema: {} }, async () =>
    text({ description: howThisWorks() }),
  );

  add("describe_schema", { description: "Introspect the database schema", inputSchema: describeSchemaInput.shape }, async (args: any) =>
    text(await describeSchema(args, { sql: deps.sql, countSql: deps.sql })),
  );
  add("run_read_query", { description: "Run a read-only SELECT query", inputSchema: runReadQueryInput.shape }, async (args: any) =>
    text(
      await runReadQuery(args, {
        unsafe: (s: string) => deps.sql.unsafe(s) as Promise<Array<Record<string, unknown>>>,
        rowCap: deps.env.MCP_ROW_CAP,
        allowPii: deps.env.MCP_ALLOW_PII,
      }),
    ),
  );
  add("get_telemetry", { description: "Summaries of misses/gaps/ingestion/retrieval", inputSchema: getTelemetryInput.shape }, async (args: any) =>
    text(await getTelemetry(args, { sql: deps.sql, tableExists: deps.tableExists })),
  );

  if (scope === "operator") {
    server.registerResource(
      "schema-dictionary",
      "schema://dictionary",
      {},
      async (uri: any) => ({
        contents: [{ uri: uri.href, text: schemaDictionaryJson() }],
      }),
    );
    server.registerResource(
      "eval-report",
      "eval://latest-report",
      {},
      async (uri: any) => ({
        contents: [{ uri: uri.href, text: (await latestEvalReport()).content }],
      }),
    );
  }

  return { server, listToolNames: () => [...registered] };
}
