import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobsClient } from "./jobs-client";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/admin/stats")) {
        return new Response(JSON.stringify({ documents: 5, dirty: 2, lastIngest: null }));
      }
      return new Response(
        JSON.stringify([
          {
            id: "j1",
            kind: "single",
            status: "failed",
            error: "boom",
            chunksWritten: null,
            documentId: "d1",
          },
        ]),
      );
    }),
  );
}

describe("JobsClient", () => {
  it("lists jobs with status and a retry on failures", async () => {
    stubFetch();
    render(<JobsClient />);
    await waitFor(() => expect(screen.getByText("failed")).toBeTruthy());
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("shows the dirty count tile from stats", async () => {
    stubFetch();
    render(<JobsClient />);
    await waitFor(() => expect(screen.getByText("Dirty")).toBeTruthy());
    expect(screen.getByText("2")).toBeTruthy();
  });
});
