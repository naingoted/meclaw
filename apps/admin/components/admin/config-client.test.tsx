import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/config",
  useSearchParams: () => {
    // Return the current nav.search, so test mutations are visible
    return nav.search;
  },
}));

import { ConfigClient } from "./config-client";

const SETTINGS = {
  agents: {
    triage: { model: "glm-4.7", thinking: false, confidence: 0.5, prompt: "triage prompt" },
    knowledge: { model: "qwen3.6-plus", thinking: false, prompt: "knowledge prompt" },
    scheduler: { model: "scheduler-only-model", thinking: false, prompt: "scheduler prompt" },
    contact: { model: "contact-only-model", thinking: false, prompt: "contact prompt" },
  },
  shared: { persona: "warm" },
  rag: { topK: 4, scoreThreshold: 0.1, tinyCorpusThreshold: 8000, scoreFloor: 0.35, clusterRadius: 0.15 },
  public: {
    greeting: "Hi", suggestions: ["a", "b"], calUrl: "https://cal.com/x",
    githubUrl: "https://github.com/x", contactEmail: "owner@example.com",
  },
};

function mockFetch(putOk = true) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "PUT") {
      return new Response(JSON.stringify(SETTINGS), { status: 200 });
    }
    return new Response(JSON.stringify(SETTINGS), { status: putOk ? 200 : 400 });
  });
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = new URLSearchParams();
  vi.stubGlobal("fetch", mockFetch());
});
afterEach(() => vi.unstubAllGlobals());

describe("ConfigClient", () => {
  it("shows model inputs only for triage (Router) and knowledge (Answer)", async () => {
    render(<ConfigClient />);
    expect(await screen.findByText("Router model")).toBeInTheDocument();
    expect(screen.getByText("Answer model")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("scheduler-only-model")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("contact-only-model")).not.toBeInTheDocument();
  });

  it("removes the thinking checkbox entirely", async () => {
    render(<ConfigClient />);
    await screen.findByText("Router model");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders a routing confidence input for triage", async () => {
    render(<ConfigClient />);
    expect(await screen.findByText("Routing confidence")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  });

  it("renders the suggestions editor and contact email when ?tab=public", async () => {
    nav.search = new URLSearchParams("tab=public");
    render(<ConfigClient />);
    await screen.findByText("Suggestions");
    const suggestionsTextarea = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLTextAreaElement).value === "a\nb");
    expect(suggestionsTextarea).toBeInTheDocument();
    expect(screen.getByText("Contact email")).toBeInTheDocument();
    expect(screen.getByDisplayValue("owner@example.com")).toBeInTheDocument();
  });

  it("renders the previously-hidden RAG knobs when ?tab=rag", async () => {
    nav.search = new URLSearchParams("tab=rag");
    render(<ConfigClient />);
    await screen.findByText("Score floor");
    expect(screen.getByText("Cluster radius")).toBeInTheDocument();
  });

  it("writes ?tab= to the URL when a tab is clicked", async () => {
    render(<ConfigClient />);
    await screen.findByText("Router model");
    const ragTab = screen.getByRole("tab", { name: /RAG params/i });
    ragTab.focus(); // Radix Tabs requires focus before click registers onValueChange in jsdom
    fireEvent.click(ragTab);
    expect(nav.replace).toHaveBeenCalledWith("/admin/config?tab=rag", { scroll: false });
  });

  it("shows the immediate-propagation toast on save", async () => {
    render(<ConfigClient />);
    await screen.findByText("Router model");
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(screen.getByText(/Saved\. Chat updates within seconds\./i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Live within ~30 min/i)).not.toBeInTheDocument();
  });
});
