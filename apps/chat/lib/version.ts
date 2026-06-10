/**
 * Build-time version identity for the chat app.
 *
 * `MECLAW_VERSION` (the git tag) and `GIT_SHA` (the commit) are injected as env
 * at image build time — see `apps/chat/Dockerfile` and `.github/workflows/deploy.yml`.
 * The widget surfaces these so a deployed build is always identifiable without
 * having to diff images. Local/dev builds have no env → reported as "dev".
 */

function clean(value: string | undefined): string | null {
  // Unreplaced build placeholders (`__MECLAW_VERSION__`) count as absent.
  if (!value || value.startsWith("__")) return null;
  return value;
}

export const MECLAW_VERSION = clean(process.env.MECLAW_VERSION) ?? "dev";

export const GIT_SHA = clean(process.env.GIT_SHA) ?? "dev";

export const GIT_SHA_SHORT = GIT_SHA === "dev" ? "dev" : GIT_SHA.slice(0, 7);

export const VERSION_LABEL = `meclaw · ${MECLAW_VERSION} · ${GIT_SHA_SHORT}`;
