import { randomUUID } from "node:crypto";
import { adminUsers } from "@meclaw/core/db/schema";
import type { Db } from "@meclaw/core/db/types";
import { logAudit } from "@meclaw/core/settings";
import { and, eq, ne } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password";

export type AdminRole = "super_admin" | "admin";
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminActor = { id: string; username: string; role: AdminRole };

export class AdminUserError extends Error {
  constructor(
    public code:
      | "duplicate_username"
      | "not_found"
      | "invalid_password"
      | "self_delete"
      | "last_super_admin"
      | "validation",
    message: string,
  ) {
    super(message);
  }
}

function normalizeUsername(username: string) {
  return username.trim();
}

function assertPassword(password: string) {
  if (password.length < 12) {
    throw new AdminUserError("validation", "Password must be at least 12 characters.");
  }
}

function assertSuperAdmin(actor: AdminActor) {
  if (actor.role !== "super_admin") {
    throw new AdminUserError(
      "validation",
      "Only super admins can create users, change roles, reset passwords, or delete users.",
    );
  }
}

async function countSuperAdmins(db: Db, excludingId?: string) {
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(
      excludingId
        ? and(eq(adminUsers.role, "super_admin"), ne(adminUsers.id, excludingId))
        : eq(adminUsers.role, "super_admin"),
    );
  return rows.length;
}

async function getById(db: Db, id: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!row) throw new AdminUserError("not_found", "Admin user not found.");
  return row;
}

export async function bootstrapAdminUser(db: Db) {
  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing.length > 0) return;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return;
  const now = new Date();
  try {
    await db.insert(adminUsers).values({
      id: randomUUID(),
      username: normalizeUsername(process.env.ADMIN_USERNAME ?? "admin"),
      passwordHash: hash,
      role: "super_admin",
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Another request may have bootstrapped first.
  }
}

export async function authorizeAdminCredentials(
  db: Db,
  username: string,
  password: string,
): Promise<AdminActor | null> {
  await bootstrapAdminUser(db);
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, normalizeUsername(username)))
    .limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) return null;
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, row.id));
  return { id: row.id, username: row.username, role: row.role as AdminRole };
}

export async function listAdminUsers(db: Db) {
  return db.select().from(adminUsers).orderBy(adminUsers.username);
}

export async function createAdminUser(
  db: Db,
  input: { username: string; password: string; role: AdminRole },
  actor: AdminActor,
  actorIp?: string,
) {
  assertSuperAdmin(actor);
  const username = normalizeUsername(input.username);
  if (!username) throw new AdminUserError("validation", "Username is required.");
  assertPassword(input.password);
  const now = new Date();
  const row = {
    id: randomUUID(),
    username,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  try {
    await db.insert(adminUsers).values(row);
  } catch {
    throw new AdminUserError("duplicate_username", "Username already exists.");
  }
  await logAudit(db, {
    action: "user.create",
    entityType: "admin_user",
    entityId: row.id,
    summary: `Created admin user ${username}`,
    actorIp,
    meta: { actor, target: { id: row.id, username, role: row.role } },
  });
  return row;
}

export async function updateAdminUser(
  db: Db,
  id: string,
  input: { role?: AdminRole; password?: string },
  actor: AdminActor,
  actorIp?: string,
) {
  assertSuperAdmin(actor);
  const existing = await getById(db, id);
  if (
    input.role === "admin" &&
    existing.role === "super_admin" &&
    (await countSuperAdmins(db, id)) === 0
  ) {
    throw new AdminUserError("last_super_admin", "Cannot demote the last super admin.");
  }
  const patch: Partial<typeof adminUsers.$inferInsert> = { updatedAt: new Date() };
  if (input.role) patch.role = input.role;
  if (input.password) {
    assertPassword(input.password);
    patch.passwordHash = await hashPassword(input.password);
  }
  const [updated] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning();
  await logAudit(db, {
    action: input.password ? "user.password_reset" : "user.role_change",
    entityType: "admin_user",
    entityId: id,
    summary: `Updated admin user ${updated.username}`,
    actorIp,
    meta: { actor, target: { id, username: updated.username, role: updated.role } },
  });
  return updated;
}

export async function deleteAdminUser(db: Db, id: string, actor: AdminActor, actorIp?: string) {
  assertSuperAdmin(actor);
  if (id === actor.id) throw new AdminUserError("self_delete", "Cannot delete your own account.");
  const existing = await getById(db, id);
  if (existing.role === "super_admin" && (await countSuperAdmins(db, id)) === 0) {
    throw new AdminUserError("last_super_admin", "Cannot delete the last super admin.");
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  await logAudit(db, {
    action: "user.delete",
    entityType: "admin_user",
    entityId: id,
    summary: `Deleted admin user ${existing.username}`,
    actorIp,
    meta: { actor, target: { id, username: existing.username, role: existing.role } },
  });
}

export async function changeOwnPassword(
  db: Db,
  actor: AdminActor,
  input: { currentPassword: string; newPassword: string },
  actorIp?: string,
) {
  assertPassword(input.newPassword);
  const existing = await getById(db, actor.id);
  if (!(await verifyPassword(input.currentPassword, existing.passwordHash))) {
    throw new AdminUserError("invalid_password", "Current password is incorrect.");
  }
  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(adminUsers.id, actor.id));
  await logAudit(db, {
    action: "user.password_change",
    entityType: "admin_user",
    entityId: actor.id,
    summary: `Changed password for ${actor.username}`,
    actorIp,
    meta: { actor, target: { id: actor.id, username: actor.username, role: actor.role } },
  });
}
