import { z } from "zod";
import { createDocument, listDocuments } from "@/lib/admin/documents";
import { clientIp, db } from "@/lib/admin/request";

const ORIGINS = ["manual", "seed", "gap"] as const;

const Body = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
  origin: z.enum(ORIGINS).optional(),
});

const OriginFilter = z.enum(ORIGINS);

export async function GET(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const raw = new URL(req.url).searchParams.get("origin");
  let origin: (typeof ORIGINS)[number] | undefined;
  if (raw !== null) {
    const parsed = OriginFilter.safeParse(raw);
    if (!parsed.success) return Response.json({ error: parsed.error?.flatten() }, { status: 400 });
    origin = parsed.data;
  }
  return Response.json(await listDocuments(await db(), origin));
}

export async function POST(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error?.flatten() }, { status: 400 });
  const doc = await createDocument(await db(), parsed.data, clientIp(req));
  return Response.json(doc, { status: 201 });
}
