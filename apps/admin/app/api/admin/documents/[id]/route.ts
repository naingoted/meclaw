import { z } from "zod";
import { deleteDocument, getDocument, updateDocument } from "@/lib/admin/documents";
import { clientIp, db } from "@/lib/admin/request";

const Body = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
  // Parity with POST: a mistyped origin is rejected (400) rather than silently
  // accepted. Origin is write-once — `updateDocument` never rewrites it, so a
  // valid origin here is validated and then discarded by design (do not wire it
  // into the update patch).
  origin: z.enum(["manual", "seed", "gap"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  // access enforced by middleware.ts (Auth.js)
  const doc = await getDocument(await db(), (await params).id);
  return doc ? Response.json(doc) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  // access enforced by middleware.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error?.flatten() }, { status: 400 });
  return Response.json(
    await updateDocument(await db(), (await params).id, parsed.data, clientIp(req)),
  );
}

export async function DELETE(req: Request, { params }: Ctx) {
  // access enforced by middleware.ts (Auth.js)
  await deleteDocument(await db(), (await params).id, clientIp(req));
  return new Response(null, { status: 204 });
}
