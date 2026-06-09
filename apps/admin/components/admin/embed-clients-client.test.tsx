import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedClientsClient } from "./embed-clients-client";

vi.stubGlobal("fetch", vi.fn());

const baseClient = {
  id: "e1",
  publicToken: "pk_abcdefgh1234567890",
  name: "Acme",
  allowedOrigins: ["https://acme.com"],
  rateLimitPerMin: null,
  createdAt: new Date(0).toISOString(),
  revokedAt: null,
};

describe("EmbedClientsClient", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("renders the page header and new-client button", () => {
    render(<EmbedClientsClient initial={[]} />);
    expect(screen.getByRole("heading", { name: /Embed clients/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /new client/i })).toBeTruthy();
  });

  it("lists clients with their origin pills and token preview", () => {
    render(<EmbedClientsClient initial={[baseClient]} />);
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("https://acme.com")).toBeTruthy();
    expect(screen.getByText(/^pk_abcdefgh/)).toBeTruthy();
  });

  it("shows an empty state when no clients exist", () => {
    render(<EmbedClientsClient initial={[]} />);
    expect(screen.getByText(/no embed clients yet/i)).toBeTruthy();
  });

  it("shows 'default' when rate limit is null", () => {
    render(<EmbedClientsClient initial={[{ ...baseClient, rateLimitPerMin: null }]} />);
    expect(screen.getByText("default")).toBeTruthy();
  });

  it("shows the rate-limit override when set", () => {
    render(<EmbedClientsClient initial={[{ ...baseClient, rateLimitPerMin: 120 }]} />);
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("shows revoked clients with a revoked pill", () => {
    const { container } = render(
      <EmbedClientsClient
        initial={[{ ...baseClient, id: "e-rev", revokedAt: new Date().toISOString() }]}
      />,
    );
    // The status pill reads "revoked"; the disabled button also reads "Revoked".
    // Scope the check to the TD cell (first column) where the pill lives.
    const cells = container.querySelectorAll("td");
    const nameCell = cells[0];
    expect(nameCell?.textContent).toMatch(/revoked/i);
  });
});
