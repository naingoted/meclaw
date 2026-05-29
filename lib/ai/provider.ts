import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

/**
 * Provider-agnostic LLM wiring. Swapping models (qwen → OpenAI/Ollama)
 * should only require editing this file.
 *
 * Uses the Vercel AI SDK Anthropic provider pointed at an Anthropic-compatible
 * gateway via a custom `baseURL`. The provider appends `/v1/messages` to the
 * base URL, so `ANTHROPIC_BASE_URL` must be the gateway root (e.g.
 * `https://.../apps/anthropic`).
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

/**
 * Build the language model from the current environment. Lazy (not module-load)
 * so importing this file during build/test never requires live credentials.
 */
export function getModel() {
  const cfg = parseAiEnv();
  const anthropic = createAnthropic({
    apiKey: cfg.ANTHROPIC_API_KEY,
    baseURL: cfg.ANTHROPIC_BASE_URL,
  });
  return anthropic(cfg.ANTHROPIC_MODEL);
}
