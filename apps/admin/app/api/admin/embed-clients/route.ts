import { clearCache } from "@meclaw/core/embed-cache";
import { z } from "zod";
import { createEmbedClient, listEmbedClients } from "@/lib/admin/embed-clients";
import { clientIp, db } from "@/lib/admin/request";

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  allowedOrigins: z.array(z.string().url()).max(50).default([]),
  rateLimitPerMin: z.number().int().positive().max(10_000).nullable().default(null),
});

export async function GET(_req: Request) {
  return Response.json(await listEmbedClients(await db()));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await createEmbedClient(await db(), parsed.data, clientIp(req));
  clearCache(); // Invalidate cache so middleware picks up new client
  return Response.json(row, { status: 201 });
}
