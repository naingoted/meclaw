import { db } from "@/lib/admin/request";
import { listRuns } from "@/lib/admin/research";

export const maxDuration = 300;

function isSseLike(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("text/event-stream") ?? false;
}

function normalizeField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export async function GET() {
  // access enforced by proxy.ts (Auth.js)
  return Response.json(await listRuns(await db()));
}

export async function POST(req: Request) {
  // access enforced by proxy.ts (Auth.js)
  const body = (await req.json().catch(() => ({}))) as {
    company?: unknown;
    role?: unknown;
    jd?: unknown;
  };
  const request = {
    company: normalizeField(body.company),
    role: normalizeField(body.role),
    jd: normalizeField(body.jd),
  };

  if (!request.company && !request.role && !request.jd) {
    return Response.json(
      { error: "Provide a company, role, or job description." },
      { status: 400 },
    );
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

  let upstream: Response;
  try {
    upstream = await fetch(`${aiServiceUrl}/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: req.signal,
    });
  } catch (error) {
    console.error("[research] AI service unreachable:", error);
    return Response.json({ error: "AI service unavailable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body || !isSseLike(upstream.headers.get("content-type"))) {
    console.error(`[research] AI service error: ${upstream.status}`);
    return Response.json({ error: "AI service error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}
