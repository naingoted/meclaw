import { getCorpusState } from "@/lib/admin/corpus";
import { db } from "@/lib/admin/request";

export async function GET() {
  // access enforced by middleware.ts (Auth.js)
  try {
    return Response.json(await getCorpusState(await db()));
  } catch {
    // read-only status must never 500 the admin UI
    return Response.json({
      version: null,
      documents: null,
      chunks: null,
      lastIngestedAt: null,
      embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
    });
  }
}
