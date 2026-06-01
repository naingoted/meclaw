import { adminGuard, db } from "@/lib/admin/request";
import { recentAudit } from "@/lib/admin/audit";

export async function GET() {
  const blocked = adminGuard(); if (blocked) return blocked;
  return Response.json(await recentAudit(await db(), 200));
}
