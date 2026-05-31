import { adminGuard, clientIp, db } from "@/lib/admin/request";
import { getSettings, updateSettings, SettingsSchema } from "@/lib/admin/settings";

export async function GET() {
  const blocked = adminGuard(); if (blocked) return blocked;
  return Response.json(await getSettings(await db()));
}
export async function PUT(req: Request) {
  const blocked = adminGuard(); if (blocked) return blocked;
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  return Response.json(await updateSettings(await db(), parsed.data, clientIp(req)));
}
