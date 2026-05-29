import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/persona";
import { loadKnowledge } from "@/lib/content";
import { initDb, saveTurn, type PersistentMessage } from "@/lib/db";

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
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: getModel(),
    system: systemPrompt(),
    messages: await convertToModelMessages(messages),
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
          // TODO: handle toolCalls from event if tools are added (M5)
        };

        await saveTurn(await getDb(), userMessages, assistantMessage);
      } catch (error) {
        // Log the error but don't throw — persistence is best-effort
        console.error("[db] Failed to persist conversation:", error instanceof Error ? error.message : error);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

/**
 * Extract text content from a UIMessage.
 * Looks for the first text part; falls back to empty string.
 */
function extractTextContent(msg: UIMessage): string {
  const textPart = msg.parts?.find((p) => p.type === "text");
  if (textPart && "text" in textPart) {
    return textPart.text;
  }
  return "";
}
