import {
  type UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { randomUUID } from "node:crypto";
import { initDb, saveTurn, saveLead, type PersistentMessage, type LeadInput } from "@meclaw/core/db";
import { notifyLead } from "@/lib/notify";
import { chatRateLimiter } from "@/lib/rate-limit";
import { detectInjection } from "@/lib/ai/guardrails";
import { configSnapshot } from "@meclaw/core/settings";

// Allow streaming responses up to 30 seconds.
export const maxDuration = 30;

/**
 * Extract the client's IP address from the request headers.
 * Prefers X-Forwarded-For (first value) for proxied requests,
 * falls back to x-real-ip, then socket address.
 *
 * ⚠️ SECURITY NOTE: X-Forwarded-For is attacker-controllable in v1 (no proxy validation).
 * The per-IP rate limit is best-effort for v1 only.
 * Production: Only trust X-Forwarded-For from a known, validated reverse proxy.
 * Consider validating the Forwarded header (RFC 7239) or configuring trusted proxies.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For may contain multiple IPs; use the first (client IP)
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback: try to extract from request URL
  try {
    return new URL(req.url).hostname || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

// Initialize the database once per process (lazy — only when handling a request)
let dbPromise: ReturnType<typeof initDb> | null = null;
async function getDb(): Promise<Awaited<ReturnType<typeof initDb>>> {
  return (dbPromise ??= initDb());
}

/**
 * Tee the upstream SSE stream: pass bytes through unchanged while accumulating
 * assistant `text-delta` content. On flush, persist best-effort (never throws).
 */
function teeForPersistence(
  upstreamBody: ReadableStream<Uint8Array>,
  messages: UIMessage[],
  conversationId: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let assistantText = "";
  let buffered = "";
  let capturedLead: Omit<LeadInput, "conversationId"> | null = null;

  // Shared logic: parse a single SSE line and accumulate text-delta content
  const accumulateDelta = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice("data:".length).trim();
    if (payload === "[DONE]" || payload.length === 0) return;
    try {
      const part = JSON.parse(payload) as {
        type?: string;
        delta?: string;
        messageMetadata?: { lead?: Omit<LeadInput, "conversationId"> };
      };
      if (part.type === "text-delta" && typeof part.delta === "string") {
        assistantText += part.delta;
      }
      const lead = part.messageMetadata?.lead;
      if (lead && (lead.email || lead.phone)) {
        capturedLead = lead;
      }
    } catch {
      // ignore non-JSON keep-alive lines
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk); // pass through unchanged
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        accumulateDelta(line);
      }
    },
    async flush() {
      // Flush any trailing multi-byte UTF-8 sequences from the decoder
      buffered += decoder.decode();
      const trimmed = buffered.trim();
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice("data:".length).trim();
        if (payload !== "[DONE]" && payload.length > 0) {
          accumulateDelta(buffered);
        }
      }

      try {
        const userMessages: PersistentMessage[] = messages
          .filter((m) => m.role === "user")
          .map((m) => ({ role: "user" as const, content: extractTextContent(m) }));
        const assistantMessage: PersistentMessage = {
          role: "assistant",
          content: assistantText,
        };
        const db = await getDb();
        await saveTurn(db, userMessages, assistantMessage, conversationId);
        if (capturedLead) {
          await saveLead(db, { conversationId, ...capturedLead });
          await notifyLead(capturedLead);
        }
      } catch (error) {
        // Best-effort: persistence failures (DB down, bad DATABASE_URL, etc.)
        // are logged and never break the stream.
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[db] Failed to persist conversation:", errorMsg);
      }
    },
  });

  return upstreamBody.pipeThrough(transform);
}

export async function POST(req: Request) {
  // Guard 1: Rate limit — check BEFORE parsing body
  const clientIp = getClientIp(req);
  const rateLimitResult = chatRateLimiter.check(clientIp);

  if (!rateLimitResult.allowed) {
    console.warn(
      `[chat] Rate limit exceeded for IP: ${clientIp}. Retry-After: ${rateLimitResult.retryAfter}s`
    );
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter),
        },
      }
    );
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    console.error("[chat] Failed to parse JSON:", e);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages: UIMessage[] = (body?.messages as UIMessage[]) || [];
  const conversationId =
    typeof body?.conversationId === "string" ? body.conversationId : randomUUID();

  // Guard 2: Injection detection — check latest user message
  const latestUserMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === "user");

  if (latestUserMessage) {
    const userText = extractTextContent(latestUserMessage);
    if (detectInjection(userText)) {
      console.warn(`[chat] Prompt injection detected from IP: ${clientIp}`);
      // Return a short-circuit refusal without calling the gateway
      return createUIMessageStreamResponse({
        stream: createRefusalStream(),
      });
    }
  }

  // Phase 3: convert UIMessage[] to the Python service contract {messages:[{role,content}]}.
  const proxyMessages = messages.map((m) => ({
    role: m.role,
    content: extractTextContent(m),
  }));

  // Snapshot the current config (request values will override env defaults in the sidecar)
  let config: unknown = undefined;
  try {
    config = await configSnapshot(await getDb());
  } catch (e) {
    console.warn(
      "[chat] config snapshot unavailable, sidecar will use env defaults:",
      e
    );
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

  let upstream: Response;
  try {
    upstream = await fetch(`${aiServiceUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: proxyMessages, config }),
      signal: req.signal,
    });
  } catch (e) {
    console.error("[chat] AI service unreachable:", e);
    return Response.json({ error: "AI service unavailable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`[chat] AI service error: ${upstream.status}`);
    return Response.json({ error: "AI service error" }, { status: 502 });
  }

  // Pipe the SSE bytes straight back to the browser. Persistence tee added in Task 12.
  return new Response(teeForPersistence(upstream.body, messages, conversationId), {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      "x-vercel-ai-ui-message-stream":
        upstream.headers.get("x-vercel-ai-ui-message-stream") ?? "v1",
      "cache-control": "no-cache",
    },
  });
}

/**
 * Creates a UI message stream with a refusal message for blocked requests.
 * Uses the Vercel AI SDK v6 UI message stream protocol so the client
 * displays it as a normal assistant message.
 */
function createRefusalStream(): ReturnType<typeof createUIMessageStream> {
  return createUIMessageStream({
    async execute({ writer }) {
      writer.write({
        type: "text-start",
        id: "refusal-1",
      });

      writer.write({
        type: "text-delta",
        id: "refusal-1",
        delta: "I appreciate your interest, but I can't respond to that request. "
          + "I'm designed to answer questions about Thet and help facilitate introductions. "
          + "Feel free to ask about his work, projects, or how to get in touch!",
      });

      writer.write({
        type: "text-end",
        id: "refusal-1",
      });
    },
  });
}

/**
 * Extract text content from a UIMessage.
 * Messages from client requests have `content` as a string;
 * internal parts-based messages have `parts` array.
 */
function extractTextContent(msg: UIMessage | Record<string, unknown>): string {
  // If the message has a direct content property (string), use it
  if (typeof (msg as Record<string, unknown>).content === "string") {
    return ((msg as Record<string, unknown>).content as string) || "";
  }
  // Otherwise, look for the first text part in the parts array
  if (Array.isArray((msg as Record<string, unknown>).parts)) {
    const parts = (msg as Record<string, unknown>).parts as unknown[];
    const textPart = parts.find(
      (p) => (p as Record<string, unknown>).type === "text"
    );
    if (textPart && "text" in (textPart as Record<string, unknown>)) {
      return ((textPart as Record<string, string>).text) || "";
    }
  }
  return "";
}
