import { EmbedClientsClient } from "@/components/admin/embed-clients-client";
import { listEmbedClients } from "@/lib/admin/embed-clients";
import { db } from "@/lib/admin/request";

export const dynamic = "force-dynamic";

export default async function EmbedClientsPage() {
  const rows = await listEmbedClients(await db());
  const initial = rows.map((r) => ({
    id: r.id,
    publicToken: r.publicToken,
    name: r.name,
    allowedOrigins: r.allowedOrigins ?? [],
    rateLimitPerMin: r.rateLimitPerMin,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
  }));
  return <EmbedClientsClient initial={initial} />;
}
