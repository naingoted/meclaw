import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditClient } from "./audit-client";

describe("AuditClient", () => {
  it("renders audit rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: "a1",
                ts: new Date().toISOString(),
                action: "config.update",
                summary: "updated config",
              },
            ]),
          ),
      ),
    );
    render(<AuditClient />);
    await waitFor(() => expect(screen.getByText("updated config")).toBeTruthy());
  });
});
