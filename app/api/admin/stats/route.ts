import { adminGuard, db } from "@/lib/admin/request";
import { computeStats } from "@/lib/admin/stats";
import { recentAudit } from "@/lib/admin/audit";

export async function GET() {
  const blocked = adminGuard();
  if (blocked) return blocked;

  const database = await db();
  const stats = await computeStats(database);
  const activity = await recentAudit(database, 10);

  return Response.json({ stats, activity });
}
