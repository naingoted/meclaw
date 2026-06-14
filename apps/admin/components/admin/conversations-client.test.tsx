import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/conversations",
  useSearchParams: () => nav.search,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ConversationsClient } from "./conversations-client";

function page(items: unknown[], nextCursor: string | null = null) {
  return new Response(JSON.stringify({ items, nextCursor }));
}
const c1 = {
  id: "c1",
  createdAt: new Date().toISOString(),
  firstUserPreview: "what is your salary?",
  turnCount: 2,
  lastMessageAt: new Date().toISOString(),
  outcome: "answered",
};

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = new URLSearchParams();
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => page([c1])),
  );
});

describe("ConversationsClient", () => {
  it("renders the conversation list with preview + outcome", async () => {
    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());
    // Scope to the table — "answered" is also an outcome-filter button label.
    const table = screen.getByRole("table");
    expect(within(table).getByText("answered")).toBeInTheDocument();
    expect(within(table).getByText("2 turns")).toBeInTheDocument();
  });

  it("links each row to its detail page", async () => {
    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /what is your salary/ })).toHaveAttribute(
      "href",
      "/admin/conversations/c1",
    );
  });

  it("writes ?outcome= to the URL when an outcome filter is clicked", async () => {
    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "gap" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/conversations?outcome=gap", { scroll: false });
  });

  it("shows 'Load more' and appends the next page", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("cursor=")
        ? page([{ ...c1, id: "c2", firstUserPreview: "second" }])
        : page([c1], "CUR"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(screen.getByText("second")).toBeInTheDocument());
    expect(screen.getByText("what is your salary?")).toBeInTheDocument(); // still present (appended)
  });

  it("debounces search input into the list fetch", async () => {
    const fetchMock = vi.fn(async () => page([c1]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search messages/i), {
      target: { value: "rust" },
    });

    // Real-timer debounce (300ms) → assert the eventual q=rust fetch lands.
    await waitFor(() =>
      expect(
        (fetchMock.mock.calls as unknown[][]).some(([url]) => String(url).includes("q=rust")),
      ).toBe(true),
    );
  });

  it("selects rows and POSTs the ids to the export endpoint", async () => {
    const exported: unknown[] = [];
    // jsdom lacks these; define them so the download side-effect doesn't throw.
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:x"),
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/export") && init?.method === "POST") {
        exported.push(JSON.parse(String(init.body)));
        return new Response("{}", {
          headers: { "content-disposition": 'attachment; filename="conversations.jsonl"' },
        });
      }
      return page([c1]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConversationsClient />);
    await waitFor(() => expect(screen.getByText("what is your salary?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /select conversation c1/i }));
    fireEvent.click(screen.getByRole("button", { name: /export jsonl/i }));

    await waitFor(() => expect(exported).toHaveLength(1));
    expect(exported[0]).toEqual({ ids: ["c1"] });
  });
});
