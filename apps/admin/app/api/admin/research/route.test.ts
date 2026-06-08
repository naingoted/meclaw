import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/request", () => ({ db: async () => ({}) }));
vi.mock("@/lib/admin/research", () => ({
  listRuns: vi.fn(async () => [{ id: "r1", input: { company: "Acme" } }]),
  getRun: vi.fn(async (_db: unknown, id: string) =>
    id === "r1" ? { run: { id: "r1" }, report: { summary: "s" }, steps: [] } : null,
  ),
}));

import { getRun, listRuns } from "@/lib/admin/research";
import { GET as GET_ONE } from "./[id]/route";
import { GET, POST } from "./route";

function createSSEResponse() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: x\n\n"));
      controller.close();
    },
  });
}

async function expectValidationError(body: string | object, expectedMessage: string) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const res = await POST(
    new Request("http://x/api/admin/research", { method: "POST", body: payload }),
  );
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: expectedMessage });
}

describe("/api/admin/research", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GET returns the runs list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe("r1");
    expect(listRuns).toHaveBeenCalledWith({});
  });

  it("POST 400s when no company/role/jd is supplied", async () => {
    await expectValidationError("{}", "Provide a company, role, or job description.");
  });

  it("POST 400s when company/role/jd are whitespace only", async () => {
    await expectValidationError(
      { company: "   ", role: "\n\t", jd: "  " },
      "Provide a company, role, or job description.",
    );
  });

  it("POST proxies to the sidecar and streams SSE back", async () => {
    const upstream = createSSEResponse();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(upstream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );

    const res = await POST(
      new Request("http://x/api/admin/research", {
        method: "POST",
        body: JSON.stringify({ company: "  Acme  " }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/research",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    const [, upstreamInit] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(upstreamInit?.body))).toEqual({
      company: "Acme",
      role: undefined,
      jd: undefined,
    });
    expect(await res.text()).toBe("data: x\n\n");
  });

  it("POST 400s when malformed field values are non-strings", async () => {
    await expectValidationError(
      { company: 123, role: null, jd: { name: "Acme" } },
      "Provide a company, role, or job description.",
    );
  });

  it("POST 502s when the upstream content type is not SSE-like", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await POST(
      new Request("http://x/api/admin/research", {
        method: "POST",
        body: JSON.stringify({ company: "Acme" }),
      }),
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "AI service error" });
  });

  it("GET /[id] returns the run detail, 404 when missing", async () => {
    const ok = await GET_ONE(new Request("http://x"), { params: Promise.resolve({ id: "r1" }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).report.summary).toBe("s");
    expect(getRun).toHaveBeenCalledWith({}, "r1");

    const missing = await GET_ONE(new Request("http://x"), {
      params: Promise.resolve({ id: "zzz" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not found" });
    expect(getRun).toHaveBeenCalledWith({}, "zzz");
  });
});
