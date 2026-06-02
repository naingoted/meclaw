import { z } from "zod";
import { clientIp, db } from "@/lib/admin/request";
import { enqueueSingle, enqueueAllDirty, listJobs } from "@/lib/admin/ingest-runner";

const Body = z.union([z.object({ documentId: z.string().min(1) }), z.object({ all: z.literal(true) })]);

export async function GET() {
// access enforced by middleware.ts (Auth.js)
  return Response.json(await listJobs(await db()));
}
export async function POST(req: Request) {
// access enforced by middleware.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const database = await db();
  if ("all" in parsed.data) return Response.json(await enqueueAllDirty(database, clientIp(req)), { status: 202 });
  return Response.json(await enqueueSingle(database, parsed.data.documentId, clientIp(req)), { status: 202 });
}
