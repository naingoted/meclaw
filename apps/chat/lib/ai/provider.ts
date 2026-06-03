import { z } from "zod";

/**
 * Provider-agnostic LLM env seam. Chat generation runs in the Python sidecar;
 * this module keeps env parsing aligned with `services/ai/app/provider.py`.
 */
const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("qwen3.6-plus"),
});

export type AiEnv = z.infer<typeof envSchema>;

/** Parse + validate the LLM-related environment. Throws (loud) if invalid. */
export function parseAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  return envSchema.parse({
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL,
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  });
}
