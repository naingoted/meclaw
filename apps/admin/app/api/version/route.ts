/**
 * Build-time version identity, matching the chat app's contract.
 * `MECLAW_VERSION` and `GIT_SHA` are injected via Dockerfile build args.
 */
export async function GET() {
  const version = process.env.MECLAW_VERSION ?? null;
  const commit = process.env.GIT_SHA?.slice(0, 7) ?? null;
  return Response.json({ version, commit });
}
