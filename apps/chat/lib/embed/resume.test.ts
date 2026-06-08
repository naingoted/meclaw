import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signResumeToken, verifyResumeToken } from "./resume";

describe("resume tokens", () => {
  beforeEach(() => {
    vi.stubEnv("RESUME_TOKEN_SECRET", "test-secret-do-not-use");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sign + verify round-trips", () => {
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    expect(verifyResumeToken({ token, conversationId: "c1", embedClientId: "e1" })).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    const tampered = token.slice(0, -4) + "zzzz";
    expect(verifyResumeToken({ token: tampered, conversationId: "c1", embedClientId: "e1" })).toBe(
      false,
    );
  });

  it("rejects when conversationId is swapped", () => {
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    expect(verifyResumeToken({ token, conversationId: "c-OTHER", embedClientId: "e1" })).toBe(
      false,
    );
  });

  it("rejects when embedClientId is swapped", () => {
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    expect(verifyResumeToken({ token, conversationId: "c1", embedClientId: "e-OTHER" })).toBe(
      false,
    );
  });

  it("returns false when RESUME_TOKEN_SECRET is unset", () => {
    vi.stubEnv("RESUME_TOKEN_SECRET", "");
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    expect(verifyResumeToken({ token, conversationId: "c1", embedClientId: "e1" })).toBe(false);
  });
});
