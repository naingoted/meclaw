import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionFooter } from "./version-footer";

describe("VersionFooter", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/version")
          return new Response(JSON.stringify({ version: "v1.2.3", commit: "abc1234" }));
        return new Response("not found", { status: 404 });
      }),
    );
  });

  it("renders version and commit after fetching", async () => {
    render(<VersionFooter />);
    await waitFor(() => {
      expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
    });
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
  });

  it("renders 'dev' when version is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: null, commit: null }))),
    );
    render(<VersionFooter />);
    await waitFor(() => {
      expect(screen.getByText(/dev/)).toBeInTheDocument();
    });
  });
});
