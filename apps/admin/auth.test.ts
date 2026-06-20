import { makeTestDb } from "@meclaw/core/db/test-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "./lib/admin/password";
import { createAdminUser } from "./lib/admin/users";

const holder: { db?: Awaited<ReturnType<typeof makeTestDb>>["db"] } = {};

vi.mock("@meclaw/core/db", () => ({
  initDb: async () => holder.db,
}));

import { authorizeCredentials } from "./lib/admin/auth-utils";

async function loadAuthConfig() {
  let capturedConfig: Record<string, unknown> | undefined;

  vi.resetModules();
  vi.doMock("next-auth", () => ({
    default: (config: Record<string, unknown>) => {
      capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
  }));
  vi.doMock("next-auth/providers/credentials", () => ({
    default: (config: Record<string, unknown>) => config,
  }));

  await import("./auth");

  if (!capturedConfig) {
    throw new Error("failed to capture auth config");
  }

  return capturedConfig as {
    callbacks: {
      jwt: (args: {
        token: Record<string, unknown>;
        user?: Record<string, unknown>;
      }) => Record<string, unknown>;
      session: (args: {
        session: { user?: Record<string, unknown> };
        token: Record<string, unknown>;
      }) => { user?: Record<string, unknown> };
    };
  };
}

describe("authorizeCredentials", () => {
  beforeEach(async () => {
    const made = await makeTestDb();
    holder.db = made.db;
    process.env.ADMIN_USERNAME = "root";
    process.env.ADMIN_PASSWORD_HASH = await hashPassword("bootstrap-pass");
  });

  it("bootstraps env admin and returns typed session identity", async () => {
    const u = await authorizeCredentials({ username: "root", password: "bootstrap-pass" });
    expect(u).toMatchObject({ name: "root", username: "root", role: "super_admin" });
    expect(u?.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("authenticates existing DB users instead of env-only credentials", async () => {
    await createAdminUser(
      holder.db!,
      { username: "ops", password: "long-password", role: "admin" },
      { id: "11111111-1111-4111-8111-111111111111", username: "root", role: "super_admin" },
    );
    const u = await authorizeCredentials({ username: "ops", password: "long-password" });
    expect(u).toMatchObject({ name: "ops", username: "ops", role: "admin" });
  });

  it("returns null for wrong password or unknown user", async () => {
    expect(await authorizeCredentials({ username: "root", password: "bad-password" })).toBeNull();
    expect(
      await authorizeCredentials({ username: "nobody", password: "bootstrap-pass" }),
    ).toBeNull();
  });
});

describe("Auth.js callbacks", () => {
  it("preserves id, username, and role for a valid user", async () => {
    const {
      callbacks: { jwt, session },
    } = await loadAuthConfig();

    const token = jwt({
      token: {},
      user: { id: "user-1", username: "ops", role: "admin" },
    });

    expect(token).toMatchObject({ id: "user-1", username: "ops", role: "admin" });
    expect(session({ session: { user: {} }, token }).user).toMatchObject({
      id: "user-1",
      username: "ops",
      role: "admin",
    });
  });

  it("ignores missing or invalid token claims instead of stringifying them", async () => {
    const {
      callbacks: { session },
    } = await loadAuthConfig();

    const user = session({
      session: { user: {} },
      token: { id: undefined, username: undefined, role: "owner" },
    }).user;

    expect(user).not.toHaveProperty("id");
    expect(user).not.toHaveProperty("username");
    expect(user).not.toHaveProperty("role");
  });
});
