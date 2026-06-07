import { z } from "zod";
import { getCluster, ignoreCluster, resolveCluster } from "@/lib/admin/gaps";
import { clientIp, db } from "@/lib/admin/request";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve"), documentId: z.string().min(1) }),
  z.object({ action: z.literal("ignore") }),
]);

export async function GET(req: Request, { params }: Ctx) {
  // access enforced by middleware.ts (Auth.js)
  const result = await getCluster(await db(), (await params).id);
  return result ? Response.json(result) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  // access enforced by middleware.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error?.flatten() }, { status: 400 });
  const id = (await params).id;
  const database = await db();
  if (parsed.data.action === "resolve") {
    await resolveCluster(database, id, parsed.data.documentId, clientIp(req));
  } else {
    await ignoreCluster(database, id, clientIp(req));
  }
  return Response.json({ ok: true });
}
