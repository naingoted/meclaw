import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GapsClient } from "./gaps-client";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/admin/gaps?") || url === "/api/admin/gaps")
        return new Response(JSON.stringify([
          { id: "c1", exemplarQuery: "what's his salary?", count: 5, status: "new", updatedAt: new Date().toISOString(), reasons: { floor: 3, fallback: 2 } },
        ]));
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

  it("close-loop POSTs a document with origin:'gap'", async () => {
    const bodies: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/gaps?") || url === "/api/admin/gaps") {
        return new Response(JSON.stringify([
          { id: "c1", exemplarQuery: "fav language?", count: 2, status: "new", updatedAt: new Date().toISOString(), reasons: {} },
        ]));
      }
      if (url === "/api/admin/gaps/c1") {
        return new Response(JSON.stringify({
          cluster: { id: "c1", exemplarQuery: "fav language?", count: 2, status: "new" },
          misses: [],
        }));
      }
      if (url === "/api/admin/documents" && init?.method === "POST") {
        bodies.doc = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: "newdoc" }), { status: 201 });
      }
      return new Response(JSON.stringify({}));
    }));

    render(<GapsClient />);
    await waitFor(() => expect(screen.getByText("fav language?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("fav language?"));
    await waitFor(() => expect(screen.getByText("Answer this gap")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Answer this gap"));
    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Fav language" } });
    fireEvent.change(screen.getByPlaceholderText("Answer content (markdown)…"), { target: { value: "Rust." } });
    fireEvent.click(screen.getByText("Save, ingest & resolve"));
    await waitFor(() => expect(bodies.doc).toEqual({ title: "Fav language", body: "Rust.", origin: "gap" }));
  });
});
