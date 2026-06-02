import { clientIp, db } from "@/lib/admin/request";
import { getSettings, updateSettings, SettingsSchema } from "@meclaw/core/settings";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)
  return Response.json(await getSettings(await db()));
}
export async function PUT(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  return Response.json(await updateSettings(await db(), parsed.data, clientIp(req)));
}
