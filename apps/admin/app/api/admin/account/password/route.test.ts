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
import { PATCH } from "./route";

const actor = { id: "actor-1", username: "root", role: "admin" as const };

describe("/api/admin/account/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authz.requireAdmin).mockResolvedValue(actor);
  });

  it("PATCH /api/admin/account/password calls requireAdmin and rejects mismatched confirmation", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/account/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: "old-password-1",
          newPassword: "new-password-1",
          confirmPassword: "new-password-2",
        }),
      }),
    );

    expect(authz.requireAdmin).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
    expect(users.changeOwnPassword).not.toHaveBeenCalled();
  });
});
