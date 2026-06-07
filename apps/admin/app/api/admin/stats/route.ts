import { recentAudit } from "@meclaw/core/settings";
import { db } from "@/lib/admin/request";
import { computeStats } from "@/lib/admin/stats";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)

  const database = await db();
  const stats = await computeStats(database);
  const activity = await recentAudit(database, 10);

  return Response.json({ stats, activity });
}
