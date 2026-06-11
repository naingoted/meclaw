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
    const tampered = `${token.slice(0, -4)}zzzz`;
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

  it("accepts the unsigned .insecure token when RESUME_TOKEN_SECRET is unset", () => {
    vi.stubEnv("RESUME_TOKEN_SECRET", "");
    const token = signResumeToken({ conversationId: "c1", embedClientId: "e1" });
    expect(verifyResumeToken({ token, conversationId: "c1", embedClientId: "e1" })).toBe(true);
  });

  it("rejects non-insecure tokens when RESUME_TOKEN_SECRET is unset", () => {
    vi.stubEnv("RESUME_TOKEN_SECRET", "");
    const fakeToken = `${Buffer.from("c1:e1", "utf8").toString("hex")}.deadbeef`;
    expect(verifyResumeToken({ token: fakeToken, conversationId: "c1", embedClientId: "e1" })).toBe(
      false,
    );
  });

  it("throws on sign and rejects on verify in production without a secret", () => {
    vi.stubEnv("RESUME_TOKEN_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signResumeToken({ conversationId: "c1", embedClientId: "e1" })).toThrow(
      "RESUME_TOKEN_SECRET is required in production",
    );
    // Even if someone forges an .insecure token, verify must reject in prod.
    const forged = `${Buffer.from("c1:e1", "utf8").toString("hex")}.insecure`;
    expect(verifyResumeToken({ token: forged, conversationId: "c1", embedClientId: "e1" })).toBe(
      false,
    );
  });
});
