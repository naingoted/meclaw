import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { JobsClient } from "./jobs-client";

describe("JobsClient", () => {
  it("lists jobs with status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "j1", kind: "single", status: "failed", error: "boom", documentId: "d1" }]))));
    render(<JobsClient />);
    await waitFor(() => expect(screen.getByText("failed")).toBeTruthy());
    expect(screen.getByText("Retry")).toBeTruthy();
  });
});
