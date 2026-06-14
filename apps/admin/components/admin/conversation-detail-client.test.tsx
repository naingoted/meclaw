import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/conversations/c1",
  useSearchParams: () => nav.search,
}));

import { ConversationDetailClient } from "./conversation-detail-client";

const DETAIL = {
  conversation: { id: "c1", createdAt: new Date().toISOString() },
  messages: [
    { id: "u1", role: "user", content: "do you know rust?", createdAt: new Date().toISOString() },
    { id: "a1", role: "assistant", content: "A little.", createdAt: new Date().toISOString() },
  ],
  retrieval: {
    a1: {
      messageId: "a1",
      query: "do you know rust?",
      intent: "knowledge",
      grounded: true,
      stuffed: false,
      topScore: 0.42,
      answerUsed: true,
      chunks: [{ id: "skills:0", source: "skills", score: 0.42, kept: true }],
    },
  },
};

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = new URLSearchParams();
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(DETAIL))),
  );
});

describe("ConversationDetailClient", () => {
  it("renders the thread in order", async () => {
    render(<ConversationDetailClient id="c1" />);
    await waitFor(() => expect(screen.getByText("do you know rust?")).toBeInTheDocument());
    expect(screen.getByText("A little.")).toBeInTheDocument();
  });

  it("shows retrieval telemetry on the Retrieval tab", async () => {
    nav.search = new URLSearchParams("tab=retrieval");
    render(<ConversationDetailClient id="c1" />);
    await waitFor(() => expect(screen.getByText("knowledge")).toBeInTheDocument());
    // 0.42 appears twice (top score + chunk score) — assert at least one.
    expect(screen.getAllByText(/0\.42/).length).toBeGreaterThan(0);
    expect(screen.getByText(/skills/)).toBeInTheDocument();
  });

  it("flags a low top score (<0.65) with the destructive class", async () => {
    nav.search = new URLSearchParams("tab=retrieval");
    const { container } = render(<ConversationDetailClient id="c1" />);
    await waitFor(() => expect(screen.getByText("knowledge")).toBeInTheDocument());
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });
});
