import { getConversation } from "@/lib/admin/conversations";
import { db } from "@/lib/admin/request";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  // access enforced by proxy.ts (Auth.js)
  const detail = await getConversation(await db(), (await params).id);
  return detail ? Response.json(detail) : Response.json({ error: "not found" }, { status: 404 });
}
