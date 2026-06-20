import { adminUsers } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { recentAudit } from "@meclaw/core/settings";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import {
  authorizeAdminCredentials,
  bootstrapAdminUser,
  changeOwnPassword,
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "./users";

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "root",
  role: "super_admin" as const,
};

describe("admin user service", () => {
  beforeEach(async () => {
    process.env.ADMIN_USERNAME = "root";
    process.env.ADMIN_PASSWORD_HASH = await hashPassword("bootstrap-pass");
  });

  it("bootstraps one super admin from env when empty", async () => {
    const { db } = await makeTestDb();
    await bootstrapAdminUser(db);
    const rows = await db.select().from(adminUsers);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("root");
    expect(rows[0].role).toBe("super_admin");
    await bootstrapAdminUser(db);
    expect(await db.select().from(adminUsers)).toHaveLength(1);
  });

  it("authorizes DB users and updates lastLoginAt", async () => {
    const { db } = await makeTestDb();
    await bootstrapAdminUser(db);
    const user = await authorizeAdminCredentials(db, "root", "bootstrap-pass");
    expect(user).toMatchObject({ username: "root", role: "super_admin" });
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.username, "root"));
    expect(row.lastLoginAt).toBeInstanceOf(Date);
    expect(await authorizeAdminCredentials(db, "root", "bad-password")).toBeNull();
  });

  it("creates users with unique immutable usernames", async () => {
    const { db } = await makeTestDb();
    const created = await createAdminUser(
      db,
      { username: "ops", password: "long-password", role: "admin" },
      actor,
      "ip",
    );
    expect(created.username).toBe("ops");
    await expect(
      createAdminUser(db, { username: "ops", password: "long-password", role: "admin" }, actor),
    ).rejects.toMatchObject({ code: "duplicate_username" });
    expect((await recentAudit(db, 5))[0].action).toBe("user.create");
  });

  it("rejects demoting or deleting the last super admin", async () => {
    const { db } = await makeTestDb();
    await createAdminUser(
      db,
      { username: "root", password: "long-password", role: "super_admin" },
      actor,
    );
    const [root] = await listAdminUsers(db);
    await expect(updateAdminUser(db, root.id, { role: "admin" }, actor)).rejects.toMatchObject({
      code: "last_super_admin",
    });
    await expect(deleteAdminUser(db, root.id, { ...actor, id: "other" })).rejects.toMatchObject({
      code: "last_super_admin",
    });
  });

  it("rejects self-delete", async () => {
    const { db } = await makeTestDb();
    const root = await createAdminUser(
      db,
      { username: "root", password: "long-password", role: "super_admin" },
      actor,
    );
    await expect(deleteAdminUser(db, root.id, { ...actor, id: root.id })).rejects.toMatchObject({
      code: "self_delete",
    });
  });

  it("rejects lifecycle actions from a normal admin but allows own password changes", async () => {
    const { db } = await makeTestDb();
    const root = await createAdminUser(
      db,
      { username: "root", password: "root-password-12", role: "super_admin" },
      actor,
    );
    const adminUser = await createAdminUser(
      db,
      { username: "ops", password: "ops-password-12", role: "admin" },
      { ...actor, id: root.id },
    );
    const targetUser = await createAdminUser(
      db,
      { username: "target", password: "target-password-12", role: "admin" },
      { ...actor, id: root.id },
    );
    const adminActor = {
      id: adminUser.id,
      username: adminUser.username,
      role: "admin" as const,
    };

    await expect(
      createAdminUser(
        db,
        { username: "blocked", password: "blocked-password-12", role: "admin" },
        adminActor,
      ),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateAdminUser(db, targetUser.id, { role: "super_admin" }, adminActor),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateAdminUser(db, targetUser.id, { password: "reset-password-12" }, adminActor),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(deleteAdminUser(db, targetUser.id, adminActor)).rejects.toMatchObject({
      code: "validation",
    });

    await changeOwnPassword(db, adminActor, {
      currentPassword: "ops-password-12",
      newPassword: "ops-password-next-12",
    });

    const [updatedAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, adminUser.id));
    expect(await verifyPassword("ops-password-next-12", updatedAdmin.passwordHash)).toBe(true);
  });

  it("resets another user's password and changes own password with current-password verification", async () => {
    const { db } = await makeTestDb();
    const root = await createAdminUser(
      db,
      { username: "root", password: "old-password", role: "super_admin" },
      actor,
    );
    await updateAdminUser(db, root.id, { password: "new-password-12" }, actor);
    let [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, root.id));
    expect(await verifyPassword("new-password-12", row.passwordHash)).toBe(true);

    await expect(
      changeOwnPassword(
        db,
        { ...actor, id: root.id },
        { currentPassword: "wrong", newPassword: "another-pass-12" },
      ),
    ).rejects.toMatchObject({ code: "invalid_password" });
    await changeOwnPassword(
      db,
      { ...actor, id: root.id },
      {
        currentPassword: "new-password-12",
        newPassword: "another-pass-12",
      },
    );
    [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, root.id));
    expect(await verifyPassword("another-pass-12", row.passwordHash)).toBe(true);
  });
});
