import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
