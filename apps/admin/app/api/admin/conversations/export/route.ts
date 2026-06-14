import { z } from "zod";
import { exportConversationsJsonl } from "@/lib/admin/conversations";
import { db } from "@/lib/admin/request";

const Body = z.object({ ids: z.array(z.string().min(1)).min(1).max(50) });

export async function POST(req: Request) {
  // access enforced by proxy.ts (Auth.js)
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error?.flatten() }, { status: 400 });

  const jsonl = await exportConversationsJsonl(await db(), parsed.data.ids);
  return new Response(jsonl, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": 'attachment; filename="conversations.jsonl"',
    },
  });
}
