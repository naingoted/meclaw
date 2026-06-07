import { listClusters } from "@/lib/admin/gaps";
import { db } from "@/lib/admin/request";

export async function GET(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const status = new URL(req.url).searchParams.get("status") ?? "new";
  return Response.json(await listClusters(await db(), status));
}
