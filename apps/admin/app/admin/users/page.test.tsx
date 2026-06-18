import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/admin/authz", () => ({
  canManageUsers: vi.fn((admin: { role: "super_admin" | "admin" }) => admin.role === "super_admin"),
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@/components/admin/users-client", () => ({
  UsersClient: ({ currentUserId }: { currentUserId: string }) => currentUserId,
}));

import * as authz from "@/lib/admin/authz";
import UsersPage from "./page";

describe("UsersPage", () => {
  it("redirects normal admins away from /admin/users", async () => {
    vi.mocked(authz.getCurrentAdmin).mockResolvedValueOnce({
      id: "u2",
      username: "ops",
      role: "admin",
    });

    await expect(UsersPage()).rejects.toThrow("REDIRECT:/admin");
  });
});
