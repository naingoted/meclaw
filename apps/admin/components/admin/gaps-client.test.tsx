import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/admin/gaps",
  useSearchParams: () => nav.search,
}));

import { GapsClient } from "./gaps-client";

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = new URLSearchParams();
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/admin/gaps?") || url === "/api/admin/gaps")
        return new Response(
          JSON.stringify([
            {
              id: "c1",
              exemplarQuery: "what's his salary?",
              count: 5,
              status: "new",
              updatedAt: new Date().toISOString(),
              reasons: { floor: 3, fallback: 2 },
            },
          ]),
        );
      return new Response("[]");
    }),
  );
});

describe("GapsClient", () => {
  it("renders the ranked cluster list with exemplar + count", async () => {
    render(<GapsClient />);
    await waitFor(() => expect(screen.getByText("what's his salary?")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("reads ?status= from the URL and marks the active button pressed", async () => {
    const urls: string[] = [];
    nav.search = new URLSearchParams("status=resolved");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response("[]");
      }),
    );
    render(<GapsClient />);
    await waitFor(() =>
      expect(urls.some((u) => u.includes("/api/admin/gaps?status=resolved"))).toBe(true),
    );
    expect(screen.getByRole("button", { name: "resolved" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "new" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("writes ?status= to the URL when a status button is clicked", async () => {
    render(<GapsClient />);
    await waitFor(() => expect(screen.getByText("what's his salary?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "resolved" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/gaps?status=resolved", { scroll: false });
  });

  it("answer flow POSTs to the atomic resolve endpoint with requestId", async () => {
    const bodies: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/admin/gaps?") || url === "/api/admin/gaps") {
          return new Response(
            JSON.stringify([
              {
                id: "c1",
                exemplarQuery: "fav lang?",
                count: 2,
                status: "new",
                updatedAt: new Date().toISOString(),
                reasons: {},
              },
            ]),
          );
        }
        if (url === "/api/admin/gaps/c1") {
          return new Response(
            JSON.stringify({
              cluster: { id: "c1", exemplarQuery: "fav lang?", count: 2, status: "new" },
              misses: [],
            }),
          );
        }
        if (url === "/api/admin/gaps/c1/resolve" && init?.method === "POST") {
          bodies.resolve = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ documentId: "d1", jobId: "j1", corpusVersion: 5 }), {
            status: 201,
          });
        }
        return new Response(JSON.stringify({}));
      }),
    );

    render(<GapsClient />);
    await waitFor(() => expect(screen.getByText("fav lang?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("fav lang?"));
    await waitFor(() => expect(screen.getByText("Answer this gap")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Answer this gap"));
    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Fav lang" } });
    fireEvent.change(screen.getByPlaceholderText("Answer content (markdown)…"), {
      target: { value: "Rust." },
    });
    fireEvent.click(screen.getByText("Save, ingest & resolve"));
    await waitFor(() => expect(bodies.resolve).toBeDefined());
    const payload = bodies.resolve as Record<string, string>;
    expect(payload.title).toBe("Fav lang");
    expect(payload.body).toBe("Rust.");
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
