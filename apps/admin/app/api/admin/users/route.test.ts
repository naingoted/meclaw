import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/authz", () => ({
  AuthzError: class AuthzError extends Error {
    constructor(
      public status: 401 | 403,
      message: string,
    ) {
      super(message);
    }
  },
  requireAdmin: vi.fn(),
  requireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/request", () => ({
  clientIp: () => "ip",
  db: async () => ({}),
}));

vi.mock("@/lib/admin/users", () => ({
  AdminUserError: class AdminUserError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  listAdminUsers: vi.fn(async () => [{ id: "u1", username: "root", role: "super_admin" }]),
  createAdminUser: vi.fn(async () => ({ id: "u2", username: "ops", role: "admin" })),
  updateAdminUser: vi.fn(async () => ({ id: "u2", username: "ops", role: "admin" })),
  deleteAdminUser: vi.fn(async () => undefined),
  changeOwnPassword: vi.fn(async () => undefined),
}));

import * as authz from "@/lib/admin/authz";
import * as users from "@/lib/admin/users";
import { GET, POST } from "./route";

const actor = { id: "actor-1", username: "root", role: "super_admin" as const };

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authz.requireSuperAdmin).mockResolvedValue(actor);
  });

  it("GET /api/admin/users calls requireSuperAdmin and returns users", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(authz.requireSuperAdmin).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual([{ id: "u1", username: "root", role: "super_admin" }]);
  });

  it("POST /api/admin/users returns 400 for password shorter than 12", async () => {
    const res = await POST(
      new Request("http://x/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "ops", password: "short", role: "admin" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(users.createAdminUser).not.toHaveBeenCalled();
  });

  it("POST /api/admin/users calls createAdminUser", async () => {
    const res = await POST(
      new Request("http://x/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: "very-secure-1",
          role: "admin",
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(users.createAdminUser).toHaveBeenCalledWith(
      expect.anything(),
      { username: "ops", password: "very-secure-1", role: "admin" },
      actor,
      "ip",
    );
  });

  it("GET /api/admin/users returns 403 for non-super-admins", async () => {
    vi.mocked(authz.requireSuperAdmin).mockRejectedValueOnce(
      new authz.AuthzError(403, "Super admin required."),
    );

    const res = await GET();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Super admin required." });
  });
});
