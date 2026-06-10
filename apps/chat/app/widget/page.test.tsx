import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WidgetPage from "./page";

vi.mock("@/lib/embed/auth", () => ({
  getChatDb: vi.fn(),
  resolveEmbedClient: vi.fn(),
}));

vi.mock("@/components/chat/chat", () => ({
  Chat: vi.fn(() => <div data-testid="chat">Chat Component</div>),
}));

import { resolveEmbedClient } from "@/lib/embed/auth";

describe("WidgetPage", () => {
  beforeEach(() => {
    vi.mocked(resolveEmbedClient).mockReset();
  });

  it("shows error when embedToken is missing", async () => {
    const page = await WidgetPage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByText(/Missing embed token/i)).toBeInTheDocument();
  });

  it("shows error when token is invalid", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue(null);
    const page = await WidgetPage({ searchParams: Promise.resolve({ embedToken: "pk_bad" }) });
    render(page);
    expect(screen.getByText(/Invalid or revoked/i)).toBeInTheDocument();
  });

  it("renders Chat component when token is valid", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue({
      id: "e1",
      publicToken: "pk_good",
      name: "Test",
      allowedOrigins: ["https://example.com"],
      rateLimitPerMin: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    const page = await WidgetPage({ searchParams: Promise.resolve({ embedToken: "pk_good" }) });
    render(page);
    expect(screen.getByTestId("chat")).toBeInTheDocument();
  });

  it("stamps the build version so the deployed widget is identifiable", async () => {
    vi.mocked(resolveEmbedClient).mockResolvedValue({
      id: "e1",
      publicToken: "pk_good",
      name: "Test",
      allowedOrigins: ["https://example.com"],
      rateLimitPerMin: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    const page = await WidgetPage({ searchParams: Promise.resolve({ embedToken: "pk_good" }) });
    render(page);
    expect(screen.getByTestId("widget-version")).toHaveTextContent(/meclaw/i);
  });
});
