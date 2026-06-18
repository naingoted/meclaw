import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/authz", () => ({
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
import { DELETE, PATCH } from "./route";

const actor = { id: "actor-1", username: "root", role: "super_admin" as const };
const ctx = { params: Promise.resolve({ id: "u2" }) };

describe("/api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authz.requireSuperAdmin).mockResolvedValue(actor);
  });

  it("PATCH /api/admin/users/[id] rejects username in body with 400", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/users/u2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "renamed" }),
      }),
      { params: ctx.params },
    );

    expect(res.status).toBe(400);
    expect(users.updateAdminUser).not.toHaveBeenCalled();
  });

  it("DELETE /api/admin/users/[id] maps self_delete to 400", async () => {
    vi.mocked(users.deleteAdminUser).mockRejectedValueOnce(
      new users.AdminUserError("self_delete", "Cannot delete your own account."),
    );

    const res = await DELETE(new Request("http://x/api/admin/users/u2", { method: "DELETE" }), {
      params: ctx.params,
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "self_delete" });
  });

  it("DELETE /api/admin/users/[id] maps last_super_admin to 400", async () => {
    vi.mocked(users.deleteAdminUser).mockRejectedValueOnce(
      new users.AdminUserError("last_super_admin", "Cannot delete the last super admin."),
    );

    const res = await DELETE(new Request("http://x/api/admin/users/u2", { method: "DELETE" }), {
      params: ctx.params,
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "last_super_admin" });
  });
});
