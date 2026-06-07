import { recentAudit } from "@meclaw/core/settings";
import { db } from "@/lib/admin/request";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)
  return Response.json(await recentAudit(await db(), 200));
}
