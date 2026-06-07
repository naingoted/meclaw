import { retryJob } from "@/lib/admin/ingest-runner";
import { clientIp, db } from "@/lib/admin/request";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // access enforced by middleware.ts (Auth.js)
  const job = await retryJob(await db(), (await params).id, clientIp(req));
  return job
    ? Response.json(job, { status: 202 })
    : Response.json({ error: "not found" }, { status: 404 });
}
