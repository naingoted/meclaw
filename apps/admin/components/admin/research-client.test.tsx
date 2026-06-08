import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/research/use-research-run");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
  );
});

afterEach(() => {
  vi.doUnmock("@/lib/research/use-research-run");
});

async function loadResearchClient() {
  const mod = await import("./research-client");
  return mod.ResearchClient;
}

describe("ResearchClient", () => {
  it("renders the empty briefings state", async () => {
    const ResearchClient = await loadResearchClient();
    render(<ResearchClient />);

    expect(screen.getByText("Briefings")).toBeTruthy();
    expect(screen.getByText("Owner → role/company intelligence")).toBeTruthy();
    expect(screen.getByRole("button", { name: /run briefing/i })).toBeDisabled();
    expect(await screen.findByText(/no briefings yet/i)).toBeTruthy();
  });

  it("shows a load error instead of a fake empty state when runs cannot be fetched", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const ResearchClient = await loadResearchClient();

    render(<ResearchClient />);

    expect(await screen.findByText("Could not load briefings.")).toBeTruthy();
    expect(screen.queryByText(/no briefings yet/i)).toBeNull();
  });

  it("surfaces a terminal no-step error run through the trace", async () => {
    vi.doMock("@/lib/research/use-research-run", () => ({
      useResearchRun: () => ({
        error: undefined,
        phase: "error" as const,
        report: null,
        reset: vi.fn(),
        start: vi.fn(),
        status: "error" as const,
        steps: [],
      }),
    }));
    const ResearchClient = await loadResearchClient();

    render(<ResearchClient />);

    expect(await screen.findByText("run failed before progress arrived")).toBeTruthy();
  });
});
