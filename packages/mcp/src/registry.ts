import type { EmbeddingClient, VectorStoreClient } from "@meclaw/rag";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ReadOnlySql } from "./db";
import type { McpEnv } from "./env";
import { latestEvalReport } from "./resources/eval-report";
import { schemaDictionaryJson } from "./resources/schema-dictionary";
import { type Scope, TOOL_SCOPES } from "./scope";
import { describeSchema, describeSchemaInput } from "./tools/describe-schema";
import { getTelemetry, getTelemetryInput } from "./tools/get-telemetry";
import { runReadQuery, runReadQueryInput } from "./tools/run-read-query";
import { searchCorpus, searchCorpusInput } from "./tools/search-corpus";
import { howThisWorks, ownerContact, scheduleCall, showResume } from "./tools/static-tools";

export interface ServerDeps {
  embedder: EmbeddingClient;
  store: VectorStoreClient;
  sql: ReadOnlySql;
  tableExists: (table: string) => Promise<boolean>;
  env: McpEnv;
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

export function buildServer(scope: Scope, deps: ServerDeps) {
  const server = new McpServer({ name: "meclaw", version: "0.1.0" });
  const registered: string[] = [];
  const allow = (name: string) => {
    const scopes = TOOL_SCOPES[name];
    if (!scopes) throw new Error(`Unknown tool: ${name}. Add it to TOOL_SCOPES in scope.ts.`);
    return scopes.includes(scope);
  };

  if (allow("search_corpus")) {
    server.registerTool(
      "search_corpus",
      {
        description: "Semantic search over the knowledge corpus",
        inputSchema: searchCorpusInput.shape,
      },
      async (args: z.infer<typeof searchCorpusInput>) => text(await searchCorpus(args, deps)),
    );
    registered.push("search_corpus");
  }

  if (allow("owner_contact")) {
    server.registerTool(
      "owner_contact",
      { description: "Owner's public contact info", inputSchema: {} },
      async () => text(ownerContact(process.env)),
    );
    registered.push("owner_contact");
  }

  if (allow("schedule_call")) {
    server.registerTool(
      "schedule_call",
      { description: "Booking link to schedule a call", inputSchema: {} },
      async () => text(scheduleCall(process.env)),
    );
    registered.push("schedule_call");
  }

  if (allow("show_resume")) {
    server.registerTool(
      "show_resume",
      { description: "Resume download link", inputSchema: {} },
      async () => text(showResume()),
    );
    registered.push("show_resume");
  }

  if (allow("how_this_works")) {
    server.registerTool(
      "how_this_works",
      { description: "Explain what meclaw is", inputSchema: {} },
      async () => text({ description: howThisWorks() }),
    );
    registered.push("how_this_works");
  }

  if (allow("describe_schema")) {
    server.registerTool(
      "describe_schema",
      { description: "Introspect the database schema", inputSchema: describeSchemaInput.shape },
      async (args: z.infer<typeof describeSchemaInput>) =>
        text(await describeSchema(args, { sql: deps.sql, countSql: deps.sql })),
    );
    registered.push("describe_schema");
  }

  if (allow("run_read_query")) {
    server.registerTool(
      "run_read_query",
      { description: "Run a read-only SELECT query", inputSchema: runReadQueryInput.shape },
      async (args: z.infer<typeof runReadQueryInput>) =>
        text(
          await runReadQuery(args, {
            unsafe: (s: string) => deps.sql.unsafe(s) as Promise<Array<Record<string, unknown>>>,
            rowCap: deps.env.MCP_ROW_CAP,
            allowPii: deps.env.MCP_ALLOW_PII,
          }),
        ),
    );
    registered.push("run_read_query");
  }

  if (allow("get_telemetry")) {
    server.registerTool(
      "get_telemetry",
      {
        description: "Summaries of misses/gaps/ingestion/retrieval",
        inputSchema: getTelemetryInput.shape,
      },
      async (args: z.infer<typeof getTelemetryInput>) =>
        text(await getTelemetry(args, { sql: deps.sql, tableExists: deps.tableExists })),
    );
    registered.push("get_telemetry");
  }

  if (scope === "operator") {
    server.registerResource("schema-dictionary", "schema://dictionary", {}, async (uri: URL) => ({
      contents: [{ uri: uri.href, text: schemaDictionaryJson() }],
    }));
    server.registerResource("eval-report", "eval://latest-report", {}, async (uri: URL) => ({
      contents: [{ uri: uri.href, text: (await latestEvalReport()).content }],
    }));
  }

  return { server, listToolNames: () => [...registered] };
}
