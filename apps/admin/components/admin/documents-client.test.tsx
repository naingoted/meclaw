import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DocumentsClient } from "./documents-client";

const NOW = "2026-06-03T00:00:00.000Z";
const LATER = "2026-06-03T01:00:00.000Z";

type State = { docs: unknown[]; jobs: unknown[] };

function stubFetchLive(get: () => State) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/admin/jobs")) {
        if (init?.method === "POST")
          return new Response(JSON.stringify({ id: "jX", status: "queued", documentId: "d1" }), { status: 202 });
        return new Response(JSON.stringify(get().jobs));
      }
      return new Response(JSON.stringify(get().docs));
    }),
  );
}

describe("DocumentsClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("lists documents from the API", async () => {
    stubFetchLive(() => ({
      docs: [{ id: "d1", title: "Resume", status: "ready", updatedAt: NOW, lastIngestedAt: NOW }],
      jobs: [],
    }));
    render(<DocumentsClient />);
    await waitFor(() => expect(screen.getByText("Resume")).toBeTruthy());
  });

  it("shows a running pill, disables Ingest while active, clears on success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state: State = {
      docs: [{ id: "d1", title: "Resume", status: "draft", updatedAt: NOW, lastIngestedAt: null }], // dirty
      jobs: [{ id: "j1", status: "running", error: null, documentId: "d1", createdAt: NOW }],
    };
    stubFetchLive(() => state);
    render(<DocumentsClient />);

    await waitFor(() => expect(screen.getByText("running")).toBeTruthy());
    expect((screen.getByRole("button", { name: /ingest/i }) as HTMLButtonElement).disabled).toBe(true);

    // Job finishes; doc is no longer dirty.
    state.jobs = [{ id: "j1", status: "succeeded", error: null, documentId: "d1", createdAt: NOW }];
    state.docs = [{ id: "d1", title: "Resume", status: "ready", updatedAt: NOW, lastIngestedAt: LATER }];

    await vi.advanceTimersByTimeAsync(2100); // trigger the 2s poll

    await waitFor(() => expect(screen.getByText("succeeded")).toBeTruthy());
    expect((screen.getByRole("button", { name: /ingest/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders a gap pill for origin:'gap' docs and not for manual docs", async () => {
    stubFetchLive(() => ({
      docs: [
        { id: "d1", title: "Manual doc", status: "ready", origin: "manual", updatedAt: NOW, lastIngestedAt: NOW },
        { id: "d2", title: "Gap doc", status: "ready", origin: "gap", updatedAt: NOW, lastIngestedAt: NOW },
      ],
      jobs: [],
    }));
    render(<DocumentsClient />);
    await waitFor(() => expect(screen.getByText("Gap doc")).toBeTruthy());
    // gap pill should appear next to Gap doc in the table, not next to Manual doc
    const gapDocRow = screen.getByText("Gap doc").closest("tr");
    const manualDocRow = screen.getByText("Manual doc").closest("tr");
    expect(gapDocRow?.textContent).toContain("gap");
    expect(manualDocRow?.textContent).not.toContain("gap");
  });

  it("requests ?origin=gap when the gap filter is selected", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/api/admin/jobs")) return new Response("[]");
        urls.push(u);
        return new Response(JSON.stringify([]));
      }),
    );
    render(<DocumentsClient />);
    await waitFor(() => expect(urls.some((u) => u.startsWith("/api/admin/documents"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "gap" }));
    await waitFor(() => expect(urls.some((u) => u.includes("/api/admin/documents?origin=gap"))).toBe(true));
  });
});
