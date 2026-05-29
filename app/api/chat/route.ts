import { streamText, convertToModelMessages, type UIMessage, stepCountIs } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/persona";
import { loadKnowledge } from "@/lib/content";
import { initDb, saveTurn, type PersistentMessage } from "@/lib/db";
import { tools } from "@/lib/ai/tools";

// Allow streaming responses up to 30 seconds.
export const maxDuration = 30;

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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    console.error("[chat] Failed to parse JSON:", e);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages: UIMessage[] = (body?.messages as UIMessage[]) || [];
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
