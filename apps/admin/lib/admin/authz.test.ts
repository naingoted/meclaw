import { describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { canManageUsers, getCurrentAdmin, requireAdmin, requireSuperAdmin } from "./authz";

describe("admin authz helpers", () => {
  it("detects user-management capability", () => {
    expect(canManageUsers({ role: "super_admin" })).toBe(true);
    expect(canManageUsers({ role: "admin" })).toBe(false);
  });

  it("returns null without a session and throws from requireAdmin", async () => {
    authMock.mockResolvedValueOnce(null);
    expect(await getCurrentAdmin()).toBeNull();
    authMock.mockResolvedValueOnce(null);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("requires super admin", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1", username: "ops", role: "admin" } });
    await expect(requireSuperAdmin()).rejects.toMatchObject({ status: 403 });
    authMock.mockResolvedValueOnce({
      user: { id: "u2", username: "root", role: "super_admin" },
    });
    await expect(requireSuperAdmin()).resolves.toEqual({
      id: "u2",
      username: "root",
      role: "super_admin",
    });
  });
});
