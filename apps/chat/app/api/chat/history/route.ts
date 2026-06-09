import { listConversationMessages } from "@meclaw/core/db";
import { getChatDb, isAllowedOrigin, resolveEmbedClient } from "@/lib/embed/auth";
import { verifyResumeToken } from "@/lib/embed/resume";

const HISTORY_LIMIT = 100;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const embedToken = url.searchParams.get("embedToken");
  const conversationId = url.searchParams.get("conversationId");
  const resumeToken = url.searchParams.get("resumeToken");
  const parentOrigin = url.searchParams.get("parentOrigin");

  if (!embedToken || !conversationId || !resumeToken) {
    return Response.json({ error: "missing required parameters" }, { status: 400 });
  }

  const db = await getChatDb();
  const client = await resolveEmbedClient(db, embedToken);
  if (!client) {
    return Response.json({ error: "embed not authorized" }, { status: 403 });
  }

  // The iframe's fetch() is same-origin (chat-app origin), so the browser's
  // Origin header identifies the iframe, not the embedding parent. The parent
  // origin is forwarded explicitly via the ?parentOrigin= query param (set by
  // the Chat component from embed.js's iframe URL).
  if (!isAllowedOrigin(client, parentOrigin)) {
    return Response.json({ error: "parent origin not allowed" }, { status: 403 });
  }

  const hmacOk = verifyResumeToken({
    token: resumeToken,
    conversationId,
    embedClientId: client.id,
  });
  if (!hmacOk) {
    return Response.json({ error: "invalid resume token" }, { status: 401 });
  }

  const rows = await listConversationMessages(db, conversationId, HISTORY_LIMIT);
  // Strip timestamps from the wire format (the client rebuilds UIMessage shapes).
  const messages = rows.map((r) => ({ id: r.id, role: r.role, content: r.content }));
  return Response.json({ conversationId, messages });
}
