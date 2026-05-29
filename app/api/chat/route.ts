import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/persona";
import { loadKnowledge } from "@/lib/content";
import { initDb, saveTurn, type PersistentMessage } from "@/lib/db";
import { tools } from "@/lib/ai/tools";
import { chatRateLimiter } from "@/lib/rate-limit";
import { detectInjection } from "@/lib/ai/guardrails";

// Allow streaming responses up to 30 seconds.
export const maxDuration = 30;

/**
 * Extract the client's IP address from the request headers.
 * Prefers X-Forwarded-For (first value) for proxied requests,
 * falls back to x-real-ip, then socket address.
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

// Knowledge is static per process — build the prompt once, reuse across requests.
// Edit `content/*.md` and restart to refresh.
let cachedSystemPrompt: string | null = null;
function systemPrompt(): string {
  return (cachedSystemPrompt ??= buildSystemPrompt(loadKnowledge()));
}

// Initialize the database once per process (lazy — only when handling a request)
let dbPromise: ReturnType<typeof initDb> | null = null;
async function getDb(): Promise<Awaited<ReturnType<typeof initDb>>> {
  return (dbPromise ??= initDb());
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

  const modelMessages = await convertToModelMessages(messages, { tools });

  const result = streamText({
    model: getModel(),
    system: systemPrompt(),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async (event) => {
      // Best-effort persistence: save the conversation and messages on stream finish.
      // Do not let DB errors break the stream — just log them.
      try {
        // Extract user messages from the request (inbound array includes entire conversation history)
        // saveTurn will persist only the last user message to avoid duplicate rows on each POST
        const userMessages: PersistentMessage[] = messages
          .filter((m) => m.role === "user")
          .map((m) => ({
            role: "user" as const,
            // Extract text from the first text part if available
            content: extractTextContent(m),
          }));

        // Extract assistant message from the stream result
        const assistantContent = event.text || "";

        const assistantMessage: PersistentMessage = {
          role: "assistant",
          content: assistantContent,
          // Note: Tool calls are executed by streamText and their results are incorporated
          // into the model's final text response (event.text), so we persist only the final text.
        };

        await saveTurn(await getDb(), userMessages, assistantMessage);
      } catch (error) {
        // Persistence is best-effort — don't break the stream
        // Distinguish native module issues from real errors for better debugging
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (
          errorMsg.includes("better-sqlite3") ||
          errorMsg.includes("bindings") ||
          errorMsg.includes("Cannot find module")
        ) {
          // Native module not built — expected in dev without build tools
          console.warn(
            "[db] Native SQLite module not available. Persistence skipped. " +
              "If this is unexpected, run: pnpm rebuild better-sqlite3"
          );
        } else {
          // Real error — log for investigation
          console.error("[db] Failed to persist conversation:", errorMsg);
        }
      }
    },
  });

  return result.toUIMessageStreamResponse();
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
