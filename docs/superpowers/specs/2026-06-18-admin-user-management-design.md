# Admin user management design

## Context

The admin app currently has a single env-backed login:

- `apps/admin/auth.ts` uses Auth.js v5 Credentials with JWT sessions.
- `apps/admin/lib/admin/auth-utils.ts` accepts `ADMIN_USERNAME ?? "admin"` and verifies `ADMIN_PASSWORD_HASH`.
- `apps/admin/proxy.ts` gates all admin routes by session presence, not by role.
- Admin pages live under `apps/admin/app/admin/*`; API mutations live under `apps/admin/app/api/admin/*`.
- Shared Postgres schema lives in `packages/core/src/db/schema.ts`, with Drizzle migrations in `packages/core/drizzle/`.
- `audit_log` exists, but current rows track `actorIp` only, not a concrete admin user.

The project now needs two admin levels:

- `super_admin`: full admin console access plus user management.
- `admin`: full existing admin console access, no user management.

Later, the same structure should support simple restrictions for gaps, documents, and conversations. The chosen future path is fixed role presets, not per-user custom permissions.

## Goals

- Replace env-only admin login with DB-backed admin users.
- Bootstrap the existing env admin as the initial `super_admin` automatically.
- Keep usernames as immutable unique login IDs.
- Let normal admins change their own password only.
- Let super admins create users, set initial passwords, change roles, reset passwords, and hard-delete users.
- Add guardrails so the system always has at least one usable `super_admin`.
- Keep the v1 permission model simple: two fixed roles now, extensible fixed-role capabilities later.
- Preserve the existing Auth.js session/proxy shape where practical.

## Non-goals

- No OAuth, email login, password reset email, MFA, or invite workflow.
- No per-user custom ACL matrix.
- No tenant model inside one database.
- No username changes after account creation.
- No soft-delete requirement. V1 permits hard-delete with guardrails.
- No changes to public chat authentication or visitor resume-token flow.

## Chosen approach

Use a DB-backed `admin_users` table with fixed roles.

This is the best fit because it creates real session identity and clean authorization hooks without turning user management into a permissions product. The existing env admin remains useful for first boot and recovery when no DB users exist, but the DB becomes the source of truth after bootstrap.

Rejected alternatives:

- **Per-user permissions now:** flexible, but too much UI, test matrix, and failure surface before section-level restrictions are actually needed.
- **Env auth plus sidecar user list:** low migration effort, but leaves weak session identity, awkward audit ownership, and messy future access restrictions.

## Data model

Add `admin_users` in `packages/core/src/db/schema.ts` and a new Drizzle migration.

Columns:

- `id` UUID primary key.
- `username` text, unique, immutable, not null.
- `passwordHash` text, not null, using the existing scrypt `salt:hash` format.
- `role` text, not null, constrained to `super_admin` or `admin`.
- `createdAt` timestamptz, not null.
- `updatedAt` timestamptz, not null.
- `lastLoginAt` timestamptz, nullable.

Indexes and constraints:

- Unique index on `username`.
- Check constraint for role values.
- Optional index on `role` if super-admin counts become a frequent query; not required for v1 scale.

Username rules:

- Usernames are immutable login IDs.
- Usernames must be unique.
- If a person needs a different username, a super admin creates a new account.

## Bootstrap

On credentials login, before user lookup:

1. Count rows in `admin_users`.
2. If there are no rows and `ADMIN_PASSWORD_HASH` exists, insert one `super_admin`.
3. Username is `ADMIN_USERNAME ?? "admin"`.
4. Password hash is copied from `ADMIN_PASSWORD_HASH`.
5. If the insert races with another request, ignore the unique/duplicate result and continue to DB lookup.

After at least one DB user exists:

- Login validates only against `admin_users`.
- Env credentials do not override DB users.
- Env variables remain documented as bootstrap/recovery inputs, not ongoing user storage.

## Authentication flow

Auth.js stays in `apps/admin/auth.ts` with JWT sessions.

Credentials authorize flow:

1. Normalize username/password from credentials.
2. Run bootstrap-if-empty.
3. Look up `admin_users.username`.
4. Verify the submitted password with the existing scrypt verifier.
5. Return `{ id, name, username, role }` on success.
6. Update `lastLoginAt` after successful verification.

Session fields:

- JWT includes `user.id`, `user.username`, and `user.role`.
- Session exposes the same fields for server and client components.

Type augmentation:

- Add Auth.js type augmentation for `role` and `username` so route/page code does not use untyped session properties.

## Authorization flow

Introduce admin auth helpers in `apps/admin/lib/admin/authz.ts`:

- `getCurrentAdmin()`: returns current admin identity or `null`.
- `requireAdmin()`: requires any authenticated admin.
- `requireSuperAdmin()`: requires role `super_admin`.
- `canManageUsers(admin)`: capability helper for current v1 role check.

Use helpers consistently:

- Existing admin pages/API routes require any admin.
- New user-management pages/API routes require super admin.
- Future document/gap/conversation restrictions should be implemented by adding fixed capability helpers, not by scattering role string checks across route handlers.

The existing proxy can keep the broad login wall. Route-level helpers provide the role checks that proxy cannot safely express for all server handlers.

## User management UI

Add two admin pages.

### `/admin/account`

Accessible to all admins.

Shows:

- Current username.
- Current role.
- Password change form with current password, new password, and confirm password.

Behavior:

- Username is displayed as immutable.
- Password change requires current password verification.
- New password and confirmation must match.
- On success, the user stays signed in. Existing sessions are JWT-backed, so v1 does not attempt global session revocation.

### `/admin/users`

Accessible only to `super_admin`.

Shows:

- User table with username, role, created date, last login, and actions.
- Create user form with username, role, and initial password.
- Role change action.
- Password reset action.
- Delete action.

Sidebar:

- Add `Account` for all admins.
- Add `Users` only for super admins.

Since `AdminSidebar` is currently a client component, it should receive the current admin role from the server layout or fetch a small current-user endpoint. Prefer passing role from `apps/admin/app/admin/layout.tsx` so navigation does not need a client-side permission fetch.

## API routes

Add routes under `apps/admin/app/api/admin`.

- `GET /api/admin/users`: list users, super admin only.
- `POST /api/admin/users`: create user, super admin only.
- `PATCH /api/admin/users/[id]`: update role or reset password, super admin only.
- `DELETE /api/admin/users/[id]`: hard-delete user, super admin only.
- `PATCH /api/admin/account/password`: change current user's own password, any admin.

Validation:

- Use Zod for request bodies.
- Reject empty usernames and passwords.
- Enforce a minimum password length of 12 characters.
- Reject username updates. No API should support changing username.

Responses:

- Return 401 for unauthenticated requests.
- Return 403 for authenticated non-super-admin access to user management routes.
- Return 400 for validation failures and last-super-admin guardrail failures.
- Return 404 for unknown target user IDs.

## Guardrails

Hard-delete is allowed, but with strict safety checks:

- A user cannot delete their own account.
- The last `super_admin` cannot be deleted.
- The last `super_admin` cannot be demoted to `admin`.
- Role changes must leave at least one `super_admin`.
- The system must not allow creating a user with a duplicate username.

Password reset:

- Super admins can reset another user's password.
- Super admins may use the account page to change their own password with current password verification.
- The user-management reset flow should not require knowing the target user's old password.

## Audit logging

Extend audit support for user-management events.

Add audit actions:

- `user.create`
- `user.role_change`
- `user.password_reset`
- `user.password_change`
- `user.delete`

For new actions, include:

- Actor user ID.
- Actor username.
- Target user ID.
- Target username.
- Target role when relevant.
- Actor IP when available.

The current `audit_log` table does not have dedicated actor user columns. V1 can store actor identity in `meta` for new user-management events. A later cleanup can add dedicated `actorUserId` and `actorUsername` columns if audit filtering by actor becomes important.

## Future permissions

The future permission model should remain role-preset based.

Current capabilities:

- `super_admin`: manage users plus all current admin functions.
- `admin`: all current admin functions except user management.

Future fixed capabilities can be introduced behind helpers, for example:

- `canManageDocuments(admin)`
- `canManageGaps(admin)`
- `canViewConversations(admin)`
- `canManageConfig(admin)`

Do not add per-user custom capability storage unless a future requirement proves role presets are insufficient.

## Migration and rollout

1. Add `admin_users` schema and migration.
2. Add user/auth service code and tests.
3. Deploy through the existing auto-migration service.
4. First successful admin login bootstraps the env admin into DB as `super_admin`.
5. Update docs to describe DB-backed users and env bootstrap.

Docs to update during implementation:

- `docs/ai/HANDOFF.md`
- `docs/ai/architecture.md`
- `docs/ai/setup.md`
- `docs/ai/repo-index.md` if new routes need indexing

Keep `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` documented, but describe them as bootstrap/recovery inputs instead of the active user store.

## Testing

Follow TDD for feature logic.

Unit tests:

- Bootstrap creates the first super admin from env when no users exist.
- Bootstrap does not overwrite existing DB users.
- DB login succeeds with valid password and fails for wrong password or unknown username.
- Session/JWT callbacks include `id`, `username`, and `role`.
- Create user validates username uniqueness.
- Role change rejects demoting the last super admin.
- Delete rejects self-delete and deleting the last super admin.
- Password reset changes the target user's hash.
- Self password change verifies current password and rejects mismatched confirmation.

Route tests:

- Non-authenticated requests fail.
- Normal `admin` cannot access user-management APIs.
- `super_admin` can access user-management APIs.
- Any admin can access account password change.

Component tests:

- Account page renders immutable username/role and password form.
- Sidebar shows `Account` for all admins.
- Sidebar shows `Users` only for super admins.
- Users page renders list/create/reset/delete flows and guardrail errors.

Verification before implementation completion:

- `pnpm test`
- `pnpm verify`

## Open implementation notes

- Read the relevant Next.js 16 docs in `node_modules/next/dist/docs/` before editing Next route/page code, per `AGENTS.md`.
- Prefer keeping password hash logic in `apps/admin/lib/admin/password.ts` unless implementation reveals a need to move it into `@meclaw/core`.
- Keep the user-management service small and testable; API route handlers should mostly parse input, call service functions, and map errors to HTTP responses.
- Avoid putting raw role string checks throughout UI and routes. Use central helpers so future role-preset restrictions are easy to add.
