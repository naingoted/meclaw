import { listConversationMessages } from "@meclaw/core/db";
import { getChatDb, isAllowedOrigin, resolveEmbedClient } from "@/lib/embed/auth";
import { verifyResumeToken } from "@/lib/embed/resume";

const HISTORY_LIMIT = 100;

/**
 * First-party (main chat) history. Same-origin requests carry no embedToken;
 * the resume token is bound to the virtual "__main__" sentinel client id.
 * No embed-client lookup and no parent-origin check — both are embed-only concerns.
 */
async function firstPartyHistory(
  conversationId: string | null,
  resumeToken: string | null,
): Promise<Response> {
  if (!conversationId || !resumeToken) {
    return Response.json({ error: "missing required parameters" }, { status: 400 });
  }
  const hmacOk = verifyResumeToken({
    token: resumeToken,
    conversationId,
    embedClientId: "__main__",
  });
  if (!hmacOk) {
    return Response.json({ error: "invalid resume token" }, { status: 401 });
  }
  const db = await getChatDb();
  const rows = await listConversationMessages(db, conversationId, HISTORY_LIMIT);
  const messages = rows.map((r) => ({ id: r.id, role: r.role, content: r.content }));
  return Response.json({ conversationId, messages });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const embedToken = url.searchParams.get("embedToken");
  const conversationId = url.searchParams.get("conversationId");
  const resumeToken = url.searchParams.get("resumeToken");
  const parentOrigin = url.searchParams.get("parentOrigin");

  // First-party (main chat) path: same-origin, no embedToken.
  if (!embedToken) {
    return firstPartyHistory(conversationId, resumeToken);
  }

  // Embed path: requires conversationId + resumeToken too.
  if (!conversationId || !resumeToken) {
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
