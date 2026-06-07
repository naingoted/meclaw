import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { checkBearer } from "../auth";
import { buildDeps } from "../deps";
import { parseMcpEnv } from "../env";
import { buildServer } from "../registry";

const env = parseMcpEnv();
const scope = process.env.MCP_SCOPE === "operator" ? "operator" : "public";
const deps = buildDeps();
const port = Number(process.env.MCP_HTTP_PORT ?? 8787);

createServer(async (req, res) => {
  if (!checkBearer(req.headers.authorization, env.MCP_AUTH_TOKEN)) {
    res.writeHead(401).end("Unauthorized");
    return;
  }
  const { server } = buildServer(scope, deps);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(port, () => console.error(`[mcp] HTTP (${scope}) on :${port}`));
