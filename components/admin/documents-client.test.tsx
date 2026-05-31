import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DocumentsClient } from "./documents-client";

describe("DocumentsClient", () => {
  it("lists documents from the API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "d1", title: "Resume", status: "ready", updatedAt: new Date().toISOString(), lastIngestedAt: new Date().toISOString() },
    ]))));
    render(<DocumentsClient />);
    await waitFor(() => expect(screen.getByText("Resume")).toBeTruthy());
  });
});
