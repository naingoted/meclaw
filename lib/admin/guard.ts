/**
 * Single switch point for admin access. v1: no real auth — a kill switch only.
 * Future: replace the body with a real session/credential check; every admin
 * route + the layout already call through here, so enabling auth is one edit.
 * Returns a Response to short-circuit, or null to allow.
 */
export function adminGuard(): Response | null {
  if (process.env.ADMIN_ENABLED === "false") {
    return new Response("Not found", { status: 404 });
  }
  return null;
}
