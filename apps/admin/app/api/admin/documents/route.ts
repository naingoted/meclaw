import { z } from "zod";
import { clientIp, db } from "@/lib/admin/request";
import { listDocuments, createDocument } from "@/lib/admin/documents";

const Body = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
});

export async function GET() {
// access enforced by middleware.ts (Auth.js)
  return Response.json(await listDocuments(await db()));
}

export async function POST(req: Request) {
// access enforced by middleware.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error?.flatten() }, { status: 400 });
  const doc = await createDocument(await db(), parsed.data, clientIp(req));
  return Response.json(doc, { status: 201 });
}
