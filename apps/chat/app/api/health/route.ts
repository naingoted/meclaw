export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", sha: process.env.GIT_SHA ?? "dev" });
}
