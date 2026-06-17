# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DB-backed admin users with `super_admin` and `admin` roles, automatic bootstrap from the existing env admin, user-management UI for super admins, and password self-service for all admins.

**Architecture:** Add `admin_users` to the shared Drizzle schema and keep auth in the admin app. Put user lifecycle rules in a focused admin service, keep Auth.js as the session layer, and route all authorization through small role/capability helpers so later section restrictions can be added without scattering role checks.

**Tech Stack:** Next.js 16 App Router · Auth.js v5 Credentials + JWT sessions · React 19 · TypeScript · Drizzle ORM + Postgres/PGlite · Zod · Vitest + Testing Library · Tailwind 4 + `@meclaw/ui`.

## Global Constraints

- Read the relevant local Next.js 16 guide in `node_modules/next/dist/docs/` before editing Next route/page/server-action code. If the docs directory is absent, run `pnpm install` first and locate the equivalent installed docs with `find node_modules/next -path '*docs*' -type f`.
- Never commit `.env.local` or filled env files.
- Usernames are immutable unique login IDs.
- Passwords use the existing scrypt `salt:hash` format from `apps/admin/lib/admin/password.ts`.
- Minimum password length is 12 characters.
- Roles are fixed presets: `super_admin` and `admin`.
- Normal admins can use all existing admin sections except user management.
- Normal admins can change only their own password.
- Super admins can create users, reset passwords, change roles, and hard-delete users.
- A user cannot delete themselves.
- The system must always keep at least one `super_admin`.
- Do not add OAuth, email reset, MFA, invites, soft delete, tenant tables, or per-user custom permissions.
- Run `pnpm test` and `pnpm verify` before claiming implementation complete.
- Use conventional commits. Never use `--no-verify`.

---

## File Structure

**Create:**
- `apps/admin/lib/admin/users.ts` — DB-backed user lifecycle service, bootstrap, login lookup, guardrails.
- `apps/admin/lib/admin/users.test.ts` — PGlite tests for lifecycle and guardrails.
- `apps/admin/lib/admin/authz.ts` — current-admin helpers and role/capability checks.
- `apps/admin/lib/admin/authz.test.ts` — helper tests with mocked `auth`.
- `apps/admin/types/next-auth.d.ts` — Auth.js session/JWT augmentation.
- `apps/admin/app/api/admin/users/route.ts` — list/create users.
- `apps/admin/app/api/admin/users/route.test.ts`
- `apps/admin/app/api/admin/users/[id]/route.ts` — update role/reset password/delete.
- `apps/admin/app/api/admin/users/[id]/route.test.ts`
- `apps/admin/app/api/admin/account/password/route.ts` — current-user password change.
- `apps/admin/app/api/admin/account/password/route.test.ts`
- `apps/admin/components/admin/account-client.tsx`
- `apps/admin/components/admin/account-client.test.tsx`
- `apps/admin/components/admin/users-client.tsx`
- `apps/admin/components/admin/users-client.test.tsx`
- `apps/admin/app/admin/account/page.tsx`
- `apps/admin/app/admin/users/page.tsx`

**Modify:**
- `packages/core/src/db/schema.ts` — add `adminUsers`.
- `packages/core/src/db/test-db.ts` — mirror `admin_users` DDL for PGlite tests.
- `packages/core/src/settings/audit.ts` — add user audit actions.
- `packages/core/drizzle/0012_*.sql` and `packages/core/drizzle/meta/_journal.json` — generated migration.
- `apps/admin/lib/admin/auth-utils.ts` — replace env-only login with DB-backed bootstrap/login.
- `apps/admin/auth.ts` — add JWT/session callbacks and typed fields.
- `apps/admin/app/admin/layout.tsx` — load current admin and pass role to sidebar.
- `apps/admin/components/admin/admin-sidebar.tsx` — add Account for all, Users for super admins.
- `apps/admin/components/admin/admin-sidebar.test.tsx` — cover role-based links.
- `docs/ai/HANDOFF.md`, `docs/ai/architecture.md`, `docs/ai/setup.md`, `docs/ai/repo-index.md` — update admin auth docs.

## Shared Interfaces

Use these names consistently.

```ts
// apps/admin/lib/admin/users.ts
export type AdminRole = "super_admin" | "admin";

export type AdminUser = {
  id: string;
  username: string;
  role: AdminRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export type AdminActor = {
  id: string;
  username: string;
  role: AdminRole;
};

export class AdminUserError extends Error {
  code:
    | "duplicate_username"
    | "not_found"
    | "invalid_password"
    | "self_delete"
    | "last_super_admin"
    | "validation";
}

export async function bootstrapAdminUser(db: Db): Promise<void>;
export async function authorizeAdminCredentials(db: Db, username: string, password: string): Promise<AdminActor | null>;
export async function listAdminUsers(db: Db): Promise<AdminUser[]>;
export async function createAdminUser(db: Db, input: { username: string; password: string; role: AdminRole }, actor: AdminActor, actorIp?: string): Promise<AdminUser>;
export async function updateAdminUser(db: Db, id: string, input: { role?: AdminRole; password?: string }, actor: AdminActor, actorIp?: string): Promise<AdminUser>;
export async function deleteAdminUser(db: Db, id: string, actor: AdminActor, actorIp?: string): Promise<void>;
export async function changeOwnPassword(db: Db, actor: AdminActor, input: { currentPassword: string; newPassword: string }, actorIp?: string): Promise<void>;
```

```ts
// apps/admin/lib/admin/authz.ts
export function canManageUsers(admin: Pick<AdminActor, "role">): boolean;
export async function getCurrentAdmin(): Promise<AdminActor | null>;
export async function requireAdmin(): Promise<AdminActor>;
export async function requireSuperAdmin(): Promise<AdminActor>;
```

---

## Task 1: Schema, Test DB, and Migration

**Files:**
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/test-db.ts`
- Generate: `packages/core/drizzle/0012_*.sql`, `packages/core/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `adminUsers` Drizzle table for all later services.

- [ ] **Step 1: Write the failing schema test**

Add this test to `packages/core/src/db/schema.test.ts`:

```ts
import { adminUsers } from "./schema";

it("admin_users accepts fixed roles and unique usernames", async () => {
  const now = new Date();
  await db.insert(adminUsers).values({
    id: "11111111-1111-4111-8111-111111111111",
    username: "root",
    passwordHash: "salt:hash",
    role: "super_admin",
    createdAt: now,
    updatedAt: now,
  });

  await expect(
    db.insert(adminUsers).values({
      id: "22222222-2222-4222-8222-222222222222",
      username: "root",
      passwordHash: "salt:hash2",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    }),
  ).rejects.toThrow();
});
```

Run: `pnpm --filter @meclaw/core test -- schema.test.ts`
Expected: FAIL because `adminUsers` is not exported.

- [ ] **Step 2: Add the Drizzle table**

In `packages/core/src/db/schema.ts`, add after `auditLog`:

```ts
export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("passwordHash").notNull(),
    role: text("role", { enum: ["super_admin", "admin"] }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
    lastLoginAt: timestamp("lastLoginAt", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_admin_users_username").on(t.username),
    check("admin_users_role_check", sql`${t.role} in ('super_admin', 'admin')`),
  ],
);
```

- [ ] **Step 3: Add PGlite DDL**

In `packages/core/src/db/test-db.ts`, add to `SCHEMA_DDL` after `audit_log`:

```ts
  `CREATE TABLE admin_users (
    id uuid PRIMARY KEY,
    username text NOT NULL,
    "passwordHash" text NOT NULL,
    role text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL,
    "lastLoginAt" timestamptz,
    CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'admin'))
  );`,
  "CREATE UNIQUE INDEX uq_admin_users_username ON admin_users (username);",
```

- [ ] **Step 4: Generate migration**

Run: `pnpm --filter @meclaw/core db:generate`
Expected: a new `packages/core/drizzle/0012_*.sql` creates `admin_users`, the unique index, and the role check.

- [ ] **Step 5: Verify tests**

Run: `pnpm --filter @meclaw/core test -- schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/core/src/db/schema.ts packages/core/src/db/test-db.ts packages/core/drizzle packages/core/src/db/schema.test.ts
git commit -m "feat(db): add admin users table"
```

## Task 2: Admin User Service

**Files:**
- Create: `apps/admin/lib/admin/users.ts`
- Create: `apps/admin/lib/admin/users.test.ts`
- Modify: `packages/core/src/settings/audit.ts`

**Interfaces:**
- Consumes: `adminUsers` table from Task 1.
- Produces: lifecycle functions from Shared Interfaces.

- [ ] **Step 1: Add user audit actions**

In `packages/core/src/settings/audit.ts`, extend `AuditAction`:

```ts
  | "user.create"
  | "user.role_change"
  | "user.password_reset"
  | "user.password_change"
  | "user.delete";
```

Extend `AuditInput["entityType"]`:

```ts
  entityType: "document" | "settings" | "job" | "gap" | "embed_client" | "admin_user";
```

- [ ] **Step 2: Write failing service tests**

Create `apps/admin/lib/admin/users.test.ts` with these tests:

```ts
import { adminUsers } from "@meclaw/core/db/schema";
import { makeTestDb } from "@meclaw/core/db/test-db";
import { recentAudit } from "@meclaw/core/settings";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import {
  AdminUserError,
  authorizeAdminCredentials,
  bootstrapAdminUser,
  changeOwnPassword,
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "./users";

const actor = { id: "11111111-1111-4111-8111-111111111111", username: "root", role: "super_admin" as const };

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
    const created = await createAdminUser(db, { username: "ops", password: "long-password", role: "admin" }, actor, "ip");
    expect(created.username).toBe("ops");
    await expect(createAdminUser(db, { username: "ops", password: "long-password", role: "admin" }, actor)).rejects.toMatchObject({ code: "duplicate_username" });
    expect((await recentAudit(db, 5))[0].action).toBe("user.create");
  });

  it("rejects demoting or deleting the last super admin", async () => {
    const { db } = await makeTestDb();
    await createAdminUser(db, { username: "root", password: "long-password", role: "super_admin" }, actor);
    const [root] = await listAdminUsers(db);
    await expect(updateAdminUser(db, root.id, { role: "admin" }, actor)).rejects.toMatchObject({ code: "last_super_admin" });
    await expect(deleteAdminUser(db, root.id, { ...actor, id: "other" })).rejects.toMatchObject({ code: "last_super_admin" });
  });

  it("rejects self-delete", async () => {
    const { db } = await makeTestDb();
    const root = await createAdminUser(db, { username: "root", password: "long-password", role: "super_admin" }, actor);
    await expect(deleteAdminUser(db, root.id, { ...actor, id: root.id })).rejects.toMatchObject({ code: "self_delete" });
  });

  it("resets another user's password and changes own password with current-password verification", async () => {
    const { db } = await makeTestDb();
    const root = await createAdminUser(db, { username: "root", password: "old-password", role: "super_admin" }, actor);
    await updateAdminUser(db, root.id, { password: "new-password-12" }, actor);
    let [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, root.id));
    expect(await verifyPassword("new-password-12", row.passwordHash)).toBe(true);

    await expect(changeOwnPassword(db, { ...actor, id: root.id }, { currentPassword: "wrong", newPassword: "another-pass-12" })).rejects.toMatchObject({ code: "invalid_password" });
    await changeOwnPassword(db, { ...actor, id: root.id }, { currentPassword: "new-password-12", newPassword: "another-pass-12" });
    [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, root.id));
    expect(await verifyPassword("another-pass-12", row.passwordHash)).toBe(true);
  });
});
```

Run: `pnpm --filter @meclaw/admin test -- users.test.ts`
Expected: FAIL because `users.ts` does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/admin/lib/admin/users.ts` with:

```ts
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
  if (password.length < 12) throw new AdminUserError("validation", "Password must be at least 12 characters.");
}

async function countSuperAdmins(db: Db, excludingId?: string) {
  const rows = await db.select({ id: adminUsers.id }).from(adminUsers).where(
    excludingId ? and(eq(adminUsers.role, "super_admin"), ne(adminUsers.id, excludingId)) : eq(adminUsers.role, "super_admin"),
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

export async function authorizeAdminCredentials(db: Db, username: string, password: string): Promise<AdminActor | null> {
  await bootstrapAdminUser(db);
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.username, normalizeUsername(username))).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) return null;
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, row.id));
  return { id: row.id, username: row.username, role: row.role as AdminRole };
}

export async function listAdminUsers(db: Db) {
  return db.select().from(adminUsers).orderBy(adminUsers.username);
}

export async function createAdminUser(db: Db, input: { username: string; password: string; role: AdminRole }, actor: AdminActor, actorIp?: string) {
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
  await logAudit(db, { action: "user.create", entityType: "admin_user", entityId: row.id, summary: `Created admin user ${username}`, actorIp, meta: { actor, target: { id: row.id, username, role: row.role } } });
  return row;
}

export async function updateAdminUser(db: Db, id: string, input: { role?: AdminRole; password?: string }, actor: AdminActor, actorIp?: string) {
  const existing = await getById(db, id);
  if (input.role === "admin" && existing.role === "super_admin" && (await countSuperAdmins(db, id)) === 0) {
    throw new AdminUserError("last_super_admin", "Cannot demote the last super admin.");
  }
  const patch: Partial<typeof adminUsers.$inferInsert> = { updatedAt: new Date() };
  if (input.role) patch.role = input.role;
  if (input.password) {
    assertPassword(input.password);
    patch.passwordHash = await hashPassword(input.password);
  }
  const [updated] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning();
  await logAudit(db, { action: input.password ? "user.password_reset" : "user.role_change", entityType: "admin_user", entityId: id, summary: `Updated admin user ${updated.username}`, actorIp, meta: { actor, target: { id, username: updated.username, role: updated.role } } });
  return updated;
}

export async function deleteAdminUser(db: Db, id: string, actor: AdminActor, actorIp?: string) {
  if (id === actor.id) throw new AdminUserError("self_delete", "Cannot delete your own account.");
  const existing = await getById(db, id);
  if (existing.role === "super_admin" && (await countSuperAdmins(db, id)) === 0) {
    throw new AdminUserError("last_super_admin", "Cannot delete the last super admin.");
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  await logAudit(db, { action: "user.delete", entityType: "admin_user", entityId: id, summary: `Deleted admin user ${existing.username}`, actorIp, meta: { actor, target: { id, username: existing.username, role: existing.role } } });
}

export async function changeOwnPassword(db: Db, actor: AdminActor, input: { currentPassword: string; newPassword: string }, actorIp?: string) {
  assertPassword(input.newPassword);
  const existing = await getById(db, actor.id);
  if (!(await verifyPassword(input.currentPassword, existing.passwordHash))) {
    throw new AdminUserError("invalid_password", "Current password is incorrect.");
  }
  await db.update(adminUsers).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(adminUsers.id, actor.id));
  await logAudit(db, { action: "user.password_change", entityType: "admin_user", entityId: actor.id, summary: `Changed password for ${actor.username}`, actorIp, meta: { actor, target: { id: actor.id, username: actor.username, role: actor.role } } });
}
```

- [ ] **Step 4: Verify service tests**

Run: `pnpm --filter @meclaw/admin test -- users.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/admin/lib/admin/users.ts apps/admin/lib/admin/users.test.ts packages/core/src/settings/audit.ts
git commit -m "feat(admin): add admin user service"
```

## Task 3: Auth.js DB Login and Typed Sessions

**Files:**
- Modify: `apps/admin/lib/admin/auth-utils.ts`
- Modify: `apps/admin/auth.ts`
- Modify: `apps/admin/auth.test.ts`
- Create: `apps/admin/types/next-auth.d.ts`

**Interfaces:**
- Consumes: `authorizeAdminCredentials(db, username, password)`.
- Produces: Auth.js session/JWT containing `id`, `username`, and `role`.

- [ ] **Step 1: Write failing auth tests**

Replace `apps/admin/auth.test.ts` with:

```ts
import { makeTestDb } from "@meclaw/core/db/test-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "./lib/admin/password";
import { createAdminUser } from "./lib/admin/users";

const holder: { db?: Awaited<ReturnType<typeof makeTestDb>>["db"] } = {};

vi.mock("@meclaw/core/db", () => ({
  initDb: async () => holder.db,
}));

import { authorizeCredentials } from "./lib/admin/auth-utils";

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
    await createAdminUser(holder.db!, { username: "ops", password: "long-password", role: "admin" }, { id: "11111111-1111-4111-8111-111111111111", username: "root", role: "super_admin" });
    const u = await authorizeCredentials({ username: "ops", password: "long-password" });
    expect(u).toMatchObject({ name: "ops", username: "ops", role: "admin" });
  });

  it("returns null for wrong password or unknown user", async () => {
    expect(await authorizeCredentials({ username: "root", password: "bad-password" })).toBeNull();
    expect(await authorizeCredentials({ username: "nobody", password: "bootstrap-pass" })).toBeNull();
  });
});
```

Run: `pnpm --filter @meclaw/admin test -- auth.test.ts`
Expected: FAIL because `authorizeCredentials` still returns `{ id: "admin", name: "admin" }`.

- [ ] **Step 2: Replace env-only authorize logic**

Update `apps/admin/lib/admin/auth-utils.ts`:

```ts
import { initDb } from "@meclaw/core/db";
import { authorizeAdminCredentials } from "./users";

export async function authorizeCredentials(creds: {
  username?: unknown;
  password?: unknown;
}): Promise<{ id: string; name: string; username: string; role: "super_admin" | "admin" } | null> {
  const username = typeof creds.username === "string" ? creds.username : "";
  const password = typeof creds.password === "string" ? creds.password : "";
  if (!username || !password) return null;
  const user = await authorizeAdminCredentials(await initDb(), username, password);
  if (!user) return null;
  return { id: user.id, name: user.username, username: user.username, role: user.role };
}
```

- [ ] **Step 3: Add Auth.js callbacks**

Update `apps/admin/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "./lib/admin/auth-utils";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: (creds) => authorizeCredentials(creds ?? {}),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.username = String(token.username);
        session.user.role = token.role as "super_admin" | "admin";
      }
      return session;
    },
  },
});
```

- [ ] **Step 4: Add type augmentation**

Create `apps/admin/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    username: string;
    role: "super_admin" | "admin";
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: "super_admin" | "admin";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    username?: string;
    role?: "super_admin" | "admin";
  }
}
```

- [ ] **Step 5: Verify auth tests and typecheck**

Run: `pnpm --filter @meclaw/admin test -- auth.test.ts`
Expected: PASS.

Run: `pnpm --filter @meclaw/admin typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/admin/auth.ts apps/admin/auth.test.ts apps/admin/lib/admin/auth-utils.ts apps/admin/types/next-auth.d.ts
git commit -m "feat(admin): authenticate admin users from database"
```

## Task 4: Authorization Helpers

**Files:**
- Create: `apps/admin/lib/admin/authz.ts`
- Create: `apps/admin/lib/admin/authz.test.ts`

**Interfaces:**
- Produces: `getCurrentAdmin`, `requireAdmin`, `requireSuperAdmin`, `canManageUsers`.

- [ ] **Step 1: Write failing helper tests**

Create `apps/admin/lib/admin/authz.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
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
    authMock.mockResolvedValueOnce({ user: { id: "u2", username: "root", role: "super_admin" } });
    await expect(requireSuperAdmin()).resolves.toEqual({ id: "u2", username: "root", role: "super_admin" });
  });
});
```

Run: `pnpm --filter @meclaw/admin test -- authz.test.ts`
Expected: FAIL because `authz.ts` does not exist.

- [ ] **Step 2: Implement helpers**

Create `apps/admin/lib/admin/authz.ts`:

```ts
import { auth } from "@/auth";
import type { AdminActor } from "./users";

export class AuthzError extends Error {
  constructor(public status: 401 | 403, message: string) {
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
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @meclaw/admin test -- authz.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add apps/admin/lib/admin/authz.ts apps/admin/lib/admin/authz.test.ts
git commit -m "feat(admin): add role authorization helpers"
```

## Task 5: User Management API Routes

**Files:**
- Create: `apps/admin/app/api/admin/users/route.ts`
- Create: `apps/admin/app/api/admin/users/route.test.ts`
- Create: `apps/admin/app/api/admin/users/[id]/route.ts`
- Create: `apps/admin/app/api/admin/users/[id]/route.test.ts`
- Create: `apps/admin/app/api/admin/account/password/route.ts`
- Create: `apps/admin/app/api/admin/account/password/route.test.ts`

**Interfaces:**
- Consumes: service and authz helpers.
- Produces: JSON APIs for UI tasks.

- [ ] **Step 1: Write route tests**

Use the existing mock style from `apps/admin/app/api/admin/documents/route.test.ts`. Create tests that mock:

```ts
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
    constructor(public code: string, message: string) { super(message); }
  },
  listAdminUsers: vi.fn(async () => [{ id: "u1", username: "root", role: "super_admin" }]),
  createAdminUser: vi.fn(async () => ({ id: "u2", username: "ops", role: "admin" })),
  updateAdminUser: vi.fn(async () => ({ id: "u2", username: "ops", role: "admin" })),
  deleteAdminUser: vi.fn(async () => undefined),
  changeOwnPassword: vi.fn(async () => undefined),
}));
```

Required assertions:
- `GET /api/admin/users` calls `requireSuperAdmin` and returns users.
- `POST /api/admin/users` returns 400 for password shorter than 12.
- `POST /api/admin/users` calls `createAdminUser`.
- `PATCH /api/admin/users/[id]` rejects username in body with 400.
- `DELETE /api/admin/users/[id]` maps `self_delete` and `last_super_admin` to 400.
- `PATCH /api/admin/account/password` calls `requireAdmin` and rejects mismatched confirmation.

Run: `pnpm --filter @meclaw/admin test -- "app/api/admin/users"`
Expected: FAIL because routes do not exist.

- [ ] **Step 2: Implement `GET` and `POST /api/admin/users`**

Create `apps/admin/app/api/admin/users/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, createAdminUser, listAdminUsers } from "@/lib/admin/users";

const createSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(12),
  role: z.enum(["super_admin", "admin"]),
});

function errorResponse(error: unknown) {
  if (error instanceof AdminUserError) {
    const status = error.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  throw error;
}

export async function GET() {
  await requireSuperAdmin();
  return NextResponse.json(await listAdminUsers(await db()));
}

export async function POST(req: Request) {
  const actor = await requireSuperAdmin();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  try {
    const user = await createAdminUser(await db(), parsed.data, actor, clientIp(req));
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 3: Implement `[id]` route**

Create `apps/admin/app/api/admin/users/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, deleteAdminUser, updateAdminUser } from "@/lib/admin/users";

const patchSchema = z.object({
  role: z.enum(["super_admin", "admin"]).optional(),
  password: z.string().min(12).optional(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof AdminUserError) {
    const status = error.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  throw error;
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Params) {
  const actor = await requireSuperAdmin();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid user update." }, { status: 400 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await updateAdminUser(await db(), id, parsed.data, actor, clientIp(req)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, ctx: Params) {
  const actor = await requireSuperAdmin();
  const { id } = await ctx.params;
  try {
    await deleteAdminUser(await db(), id, actor, clientIp(req));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 4: Implement account password route**

Create `apps/admin/app/api/admin/account/password/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, changeOwnPassword } from "@/lib/admin/users";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
  confirmPassword: z.string().min(12),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export async function PATCH(req: Request) {
  const actor = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid password payload." }, { status: 400 });
  try {
    await changeOwnPassword(await db(), actor, parsed.data, clientIp(req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminUserError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }
}
```

- [ ] **Step 5: Verify routes**

Run: `pnpm --filter @meclaw/admin test -- "app/api/admin/users" "app/api/admin/account/password"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/admin/app/api/admin/users apps/admin/app/api/admin/account/password
git commit -m "feat(admin): add admin user APIs"
```

## Task 6: Account UI and Page

**Files:**
- Create: `apps/admin/components/admin/account-client.tsx`
- Create: `apps/admin/components/admin/account-client.test.tsx`
- Create: `apps/admin/app/admin/account/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/account/password`.

- [ ] **Step 1: Write component test**

Create `apps/admin/components/admin/account-client.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountClient } from "./account-client";

describe("AccountClient", () => {
  it("shows immutable account identity and changes password", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<AccountClient admin={{ id: "u1", username: "ops", role: "admin" }} />);
    expect(screen.getByText("ops")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    await userEvent.type(screen.getByLabelText(/current password/i), "old-password");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-password-12");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "new-password-12");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/account/password", expect.objectContaining({ method: "PATCH" })));
    fetchMock.mockRestore();
  });
});
```

Run: `pnpm --filter @meclaw/admin test -- account-client.test.tsx`
Expected: FAIL because component does not exist.

- [ ] **Step 2: Implement component**

Create `apps/admin/components/admin/account-client.tsx`:

```tsx
"use client";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@meclaw/ui";
import { useState } from "react";
import type { AdminActor } from "@/lib/admin/users";

export function AccountClient({ admin }: { admin: AdminActor }) {
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setStatus(null);
    const res = await fetch("/api/admin/account/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
      }),
    });
    setStatus(res.ok ? "Password updated." : "Password update failed.");
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Username</span><div className="font-mono">{admin.username}</div></div>
          <div><span className="text-muted-foreground">Role</span><div className="font-mono">{admin.role}</div></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Password</CardTitle></CardHeader>
        <CardContent>
          <form action={onSubmit} className="grid gap-3">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" required />
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" name="newPassword" type="password" minLength={12} required />
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" minLength={12} required />
            <Button type="submit">Change password</Button>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add page**

Create `apps/admin/app/admin/account/page.tsx`:

```tsx
import { AdminPage } from "@/components/admin/framework";
import { AccountClient } from "@/components/admin/account-client";
import { requireAdmin } from "@/lib/admin/authz";

export default async function AccountPage() {
  const admin = await requireAdmin();
  return (
    <AdminPage title="Account" subtitle="Manage your admin password. Username is immutable.">
      <AccountClient admin={admin} />
    </AdminPage>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @meclaw/admin test -- account-client.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/admin/components/admin/account-client.tsx apps/admin/components/admin/account-client.test.tsx apps/admin/app/admin/account/page.tsx
git commit -m "feat(admin): add account password page"
```

## Task 7: Users UI and Page

**Files:**
- Create: `apps/admin/components/admin/users-client.tsx`
- Create: `apps/admin/components/admin/users-client.test.tsx`
- Create: `apps/admin/app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `/api/admin/users` and `/api/admin/users/[id]`.

- [ ] **Step 1: Write component test**

Create `apps/admin/components/admin/users-client.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsersClient } from "./users-client";

describe("UsersClient", () => {
  it("lists users and creates a new admin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "u1", username: "root", role: "super_admin", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u2", username: "ops", role: "admin" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    render(<UsersClient currentUserId="u1" />);
    expect(await screen.findByText("root")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/username/i), "ops");
    await userEvent.type(screen.getByLabelText(/initial password/i), "new-password-12");
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST" })));
    fetchMock.mockRestore();
  });
});
```

Run: `pnpm --filter @meclaw/admin test -- users-client.test.tsx`
Expected: FAIL because component does not exist.

- [ ] **Step 2: Implement component**

Create `apps/admin/components/admin/users-client.tsx` using a compact version of the existing admin client pattern:

```tsx
"use client";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@meclaw/ui";
import { useEffect, useState } from "react";

type Row = { id: string; username: string; role: "super_admin" | "admin"; createdAt: string; lastLoginAt: string | null };

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<Row[]>([]);
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
  }

  useEffect(() => { void load(); }, []);

  async function createUser(formData: FormData) {
    setStatus(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: formData.get("username"), password: formData.get("password"), role }),
    });
    setStatus(res.ok ? "User created." : "Create failed.");
    if (res.ok) await load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setStatus(res.ok ? "User deleted." : "Delete failed.");
    if (res.ok) await load();
  }

  return (
    <div className="grid gap-6">
      <form action={createUser} className="grid max-w-xl gap-3">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" required />
        <Label htmlFor="password">Initial password</Label>
        <Input id="password" name="password" type="password" minLength={12} required />
        <Select value={role} onValueChange={(value) => setRole(value as "admin" | "super_admin")}>
          <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="super_admin">super_admin</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit">Create user</Button>
      </form>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      <div className="grid gap-2">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
            <div><span className="font-mono">{user.username}</span> <span className="text-muted-foreground">{user.role}</span></div>
            <Button type="button" variant="ghost-danger" size="sm" disabled={user.id === currentUserId} onClick={() => void remove(user.id)}>Delete</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Extend `apps/admin/components/admin/users-client.test.tsx` with:

```tsx
it("changes role and resets passwords", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "u2", username: "ops", role: "admin", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u2", username: "ops", role: "super_admin" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u2", username: "ops", role: "super_admin" }), { status: 200 }));
  render(<UsersClient currentUserId="u1" />);
  expect(await screen.findByText("ops")).toBeTruthy();
  await userEvent.selectOptions(screen.getByLabelText("Role for ops"), "super_admin");
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "PATCH" })));
  await userEvent.type(screen.getByLabelText("New password for ops"), "reset-password-12");
  await userEvent.click(screen.getByRole("button", { name: /reset password for ops/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  fetchMock.mockRestore();
});
```

Then add per-row controls in `UsersClient`:

```tsx
async function patchUser(id: string, body: Record<string, string>) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  setStatus(res.ok ? "User updated." : "Update failed.");
  if (res.ok) await load();
}
```

Inside each row render:

```tsx
<select
  aria-label={`Role for ${user.username}`}
  value={user.role}
  onChange={(event) => void patchUser(user.id, { role: event.currentTarget.value })}
>
  <option value="admin">admin</option>
  <option value="super_admin">super_admin</option>
</select>
<form action={(formData) => patchUser(user.id, { password: String(formData.get("password") ?? "") })} className="flex gap-2">
  <Input aria-label={`New password for ${user.username}`} name="password" type="password" minLength={12} />
  <Button type="submit" size="sm">Reset password for {user.username}</Button>
</form>
```

- [ ] **Step 3: Add page**

Create `apps/admin/app/admin/users/page.tsx`:

```tsx
import { UsersClient } from "@/components/admin/users-client";
import { AdminPage } from "@/components/admin/framework";
import { requireSuperAdmin } from "@/lib/admin/authz";

export default async function UsersPage() {
  const admin = await requireSuperAdmin();
  return (
    <AdminPage title="Users" subtitle="Create admins, reset passwords, and manage roles.">
      <UsersClient currentUserId={admin.id} />
    </AdminPage>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @meclaw/admin test -- users-client.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/admin/components/admin/users-client.tsx apps/admin/components/admin/users-client.test.tsx apps/admin/app/admin/users/page.tsx
git commit -m "feat(admin): add user management page"
```

## Task 8: Role-Aware Sidebar

**Files:**
- Modify: `apps/admin/app/admin/layout.tsx`
- Modify: `apps/admin/components/admin/admin-sidebar.tsx`
- Modify: `apps/admin/components/admin/admin-sidebar.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin`.

- [ ] **Step 1: Update sidebar tests first**

Change renders to pass an explicit role:

```tsx
render(<AdminSidebar role="super_admin" />);
expect(screen.getByRole("link", { name: /Users/ })).toHaveAttribute("href", "/admin/users");
expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute("href", "/admin/account");
```

Add a second test:

```tsx
it("hides Users from normal admins", () => {
  render(<AdminSidebar role="admin" />);
  expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute("href", "/admin/account");
  expect(screen.queryByRole("link", { name: /Users/ })).toBeNull();
});
```

Run: `pnpm --filter @meclaw/admin test -- admin-sidebar.test.tsx`
Expected: FAIL because `AdminSidebar` takes no `role` prop.

- [ ] **Step 2: Update sidebar**

Change signature:

```tsx
export function AdminSidebar({ role }: { role: "super_admin" | "admin" }) {
```

Add imports:

```ts
import { Shield, UserRound } from "lucide-react";
```

Add Account to the Configuration group:

```ts
{ label: "Account", href: "/admin/account", Icon: UserRound },
```

Render Users conditionally near Configuration or Activity:

```tsx
{role === "super_admin" ? (
  <Link
    href="/admin/users"
    className={cn(
      "flex items-center gap-2 rounded-sm border-l-2 border-transparent px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      pathname.startsWith("/admin/users") && "border-primary bg-primary/10 text-foreground",
    )}
  >
    <Shield className="h-3.5 w-3.5" />
    Users
  </Link>
) : null}
```

Keep the existing active-link styling exactly as used by other links.

- [ ] **Step 3: Pass role from layout**

Update `apps/admin/app/admin/layout.tsx`:

```tsx
import { requireAdmin } from "@/lib/admin/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar role={admin.role} />
      ...
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @meclaw/admin test -- admin-sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/admin/app/admin/layout.tsx apps/admin/components/admin/admin-sidebar.tsx apps/admin/components/admin/admin-sidebar.test.tsx
git commit -m "feat(admin): add role-aware admin navigation"
```

## Task 9: Documentation Updates

**Files:**
- Modify: `docs/ai/HANDOFF.md`
- Modify: `docs/ai/architecture.md`
- Modify: `docs/ai/setup.md`
- Modify: `docs/ai/repo-index.md`

- [ ] **Step 1: Update admin-auth statements**

Replace “single admin” language with:

```md
Admin auth: DB-backed `admin_users` table with Auth.js JWT sessions. The first admin is bootstrapped as `super_admin` from `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` when the table is empty.
```

- [ ] **Step 2: Update setup env descriptions**

In `docs/ai/setup.md`, describe:

```md
`ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are bootstrap/recovery inputs. On first login after migrations, the admin app creates the initial `super_admin` row if `admin_users` is empty. After DB users exist, login validates against the database.
```

- [ ] **Step 3: Update repo index**

Add:

```md
apps/admin/app/admin/{account,users}/
apps/admin/app/api/admin/{account,password,users}/
apps/admin/lib/admin/{users,authz}.ts
```

- [ ] **Step 4: Verify markdown diff**

Run: `git diff --check -- docs/ai/HANDOFF.md docs/ai/architecture.md docs/ai/setup.md docs/ai/repo-index.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/ai/HANDOFF.md docs/ai/architecture.md docs/ai/setup.md docs/ai/repo-index.md
git commit -m "docs: document database-backed admin users"
```

## Task 10: Full Verification and Browser Smoke

**Files:**
- No new source files unless verification exposes bugs.

- [ ] **Step 1: Run unit tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Run full repo verification**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 3: Run local admin app smoke**

Start the stack or admin app according to `docs/ai/setup.md`.

Run: `pnpm dev`
Expected: admin is available at `http://localhost:3001`.

Smoke flow:
- Login with existing env admin.
- Confirm `/admin/account` shows username and role.
- Confirm `/admin/users` is visible for super admin.
- Create a normal admin.
- Sign out.
- Login as normal admin.
- Confirm `/admin/users` is not visible and direct navigation is blocked.
- Confirm normal admin can change password from `/admin/account`.

- [ ] **Step 4: Commit any verification fixes**

If smoke reveals a bug, add a focused regression test and commit:

```bash
pnpm format
git status --short
git commit -m "fix(admin): correct admin user management smoke issue"
```

Only run the commit after staging the regression test and the source file that fixes it.

- [ ] **Step 5: Final status**

Run: `git status --short`
Expected: clean worktree.

Report:
- latest commit SHA(s)
- `pnpm test` result
- `pnpm verify` result
- browser smoke result or exact blocker
