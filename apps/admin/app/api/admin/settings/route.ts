import { getSettings, SettingsSchema, updateSettings } from "@meclaw/core/settings";
import { clientIp, db } from "@/lib/admin/request";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)
  return Response.json(await getSettings(await db()));
}
export async function PUT(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: parsed.error.flatten(),
        // Dot-path per issue so the client can map errors back to form fields.
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  return Response.json(await updateSettings(await db(), parsed.data, clientIp(req)));
}
