import { conversationStats } from "@/lib/admin/conversations";
import { db } from "@/lib/admin/request";

export async function GET() {
  // access enforced by proxy.ts (Auth.js)
  return Response.json(await conversationStats(await db(), 7));
}
