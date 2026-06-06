import { z } from "zod";

const schema = z.object({
  MCP_DATABASE_URL: z.string().min(1, "MCP_DATABASE_URL is required"),
  MCP_AUTH_TOKEN: z.string().optional(),
  MCP_ALLOW_PII: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => v === true || v === "true"),
  MCP_ROW_CAP: z.coerce.number().int().positive().max(1000).default(100),
  MCP_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type McpEnv = z.infer<typeof schema>;

export function parseMcpEnv(env: Record<string, string | undefined> = process.env): McpEnv {
  return schema.parse(env);
}
