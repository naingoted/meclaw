import { exportMissesCsv } from "@/lib/admin/gaps";
import { db } from "@/lib/admin/request";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)
  const csv = await exportMissesCsv(await db());
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="chat_misses.csv"',
    },
  });
}
