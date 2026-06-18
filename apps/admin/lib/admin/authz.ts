import { auth } from "@/auth";
import type { AdminActor } from "./users";

export class AuthzError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export function canManageUsers(admin: Pick<AdminActor, "role">) {
  return admin.role === "super_admin";
}

export async function getCurrentAdmin(): Promise<AdminActor | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.username || !user.role) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function requireAdmin(): Promise<AdminActor> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthzError(401, "Authentication required.");
  return admin;
}

export async function requireSuperAdmin(): Promise<AdminActor> {
  const admin = await requireAdmin();
  if (!canManageUsers(admin)) throw new AuthzError(403, "Super admin required.");
  return admin;
}
