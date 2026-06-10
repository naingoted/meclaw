import { z } from "zod";
import { resolveGapAtomic } from "@/lib/admin/gaps";
import { clientIp, db } from "@/lib/admin/request";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  requestId: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Answer content is required"),
});

/**
 * Idempotent gap resolution. Replaces the prior 3-step flow
 * (POST documents → POST jobs → PATCH gaps) with a single transaction.
 */
export async function POST(req: Request, { params }: Ctx) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const clusterId = (await params).id;
  const result = await resolveGapAtomic(await db(), clusterId, {
    ...parsed.data,
    actorIp: clientIp(req),
  });
  return Response.json(result, { status: 201 });
}
