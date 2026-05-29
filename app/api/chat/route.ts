import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/persona";
import { loadKnowledge } from "@/lib/content";

// Allow streaming responses up to 30 seconds.
export const maxDuration = 30;

// Knowledge is static per process — build the prompt once, reuse across requests.
// Edit `content/*.md` and restart to refresh.
let cachedSystemPrompt: string | null = null;
function systemPrompt(): string {
  return (cachedSystemPrompt ??= buildSystemPrompt(loadKnowledge()));
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: getModel(),
    system: systemPrompt(),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
