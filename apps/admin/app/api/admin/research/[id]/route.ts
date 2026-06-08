import { db } from "@/lib/admin/request";
import { getRun } from "@/lib/admin/research";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  // access enforced by proxy.ts (Auth.js)
  const detail = await getRun(await db(), (await params).id);
  return detail ? Response.json(detail) : Response.json({ error: "not found" }, { status: 404 });
}
