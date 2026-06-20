import { afterEach, describe, expect, it, vi } from "vitest";

// next-auth's real entrypoint pulls in next/server and breaks under vitest, so
// mock it (mirrors auth.test.ts). We only need AuthError to be instanceof-able.
const { AuthError, signInMock } = vi.hoisted(() => {
  class AuthError extends Error {}
  return { AuthError, signInMock: vi.fn() };
});

vi.mock("next-auth", () => ({ AuthError }));
vi.mock("@/auth", () => ({ signIn: (...args: unknown[]) => signInMock(...args) }));

import { loginAction } from "./actions";

describe("loginAction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a friendly message when Auth.js rejects the credentials", async () => {
    signInMock.mockRejectedValueOnce(new AuthError());

    const result = await loginAction({ error: null }, new FormData());

    expect(result).toEqual({ error: "Invalid username or password." });
  });

  it("re-throws the redirect control-flow error so a valid sign-in still redirects", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    signInMock.mockRejectedValueOnce(redirect);

    await expect(loginAction({ error: null }, new FormData())).rejects.toBe(redirect);
  });
});
