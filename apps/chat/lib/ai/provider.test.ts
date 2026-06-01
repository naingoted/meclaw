import { describe, expect, it } from "vitest";
import { parseAiEnv } from "./provider";

describe("parseAiEnv", () => {
  it("throws when ANTHROPIC_API_KEY is missing", () => {
    expect(() => parseAiEnv({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("defaults the model to qwen3.6-plus when unset", () => {
    const cfg = parseAiEnv({ ANTHROPIC_API_KEY: "sk-test" });
    expect(cfg.ANTHROPIC_MODEL).toBe("qwen3.6-plus");
  });

  it("passes through provided base URL and model", () => {
    const cfg = parseAiEnv({
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "https://gateway.example/apps/anthropic",
      ANTHROPIC_MODEL: "qwen3.6-plus",
    });
    expect(cfg.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(cfg.ANTHROPIC_BASE_URL).toBe("https://gateway.example/apps/anthropic");
    expect(cfg.ANTHROPIC_MODEL).toBe("qwen3.6-plus");
  });
});
