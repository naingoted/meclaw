import { z } from "zod";
import { revokeEmbedClient, updateEmbedClient } from "@/lib/admin/embed-clients";
import { clientIp, db } from "@/lib/admin/request";

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    allowedOrigins: z.array(z.string().url()).max(50).optional(),
    rateLimitPerMin: z.number().int().positive().max(10_000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.allowedOrigins !== undefined || v.rateLimitPerMin !== undefined,
    { message: "at least one field must be supplied" },
  );

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;
  const row = await updateEmbedClient(await db(), id, parsed.data, clientIp(req));
  return Response.json(row);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  await revokeEmbedClient(await db(), id, clientIp(req));
  return new Response(null, { status: 204 });
}
