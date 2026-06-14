import { listConversations, type Outcome } from "@/lib/admin/conversations";
import { db } from "@/lib/admin/request";

const OUTCOMES: Outcome[] = ["answered", "gap", "abandoned"];
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // access enforced by middleware.ts (Auth.js)
  const params = new URL(req.url).searchParams;

  const toRaw = params.get("to");
  const fromRaw = params.get("from");
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - DEFAULT_WINDOW_MS);

  const outcomeRaw = params.get("outcome");
  const outcome = OUTCOMES.includes(outcomeRaw as Outcome) ? (outcomeRaw as Outcome) : undefined;

  const limitRaw = Number(params.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : undefined;

  return Response.json(
    await listConversations(await db(), {
      from,
      to,
      outcome,
      q: params.get("q") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
      limit,
    }),
  );
}
