import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildDeps } from "../deps";
import { buildServer } from "../registry";

// stdio is local + tokenless. Default scope = operator (you, on your machine).
const scope = process.env.MCP_SCOPE === "public" ? "public" : "operator";
const { server } = buildServer(scope, buildDeps());
await server.connect(new StdioServerTransport());
