import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WidgetPage from "./page";

const publicSettings = {
  greeting: "Hi from admin",
  suggestions: ["One", "Two", "Three"],
  calUrl: "https://cal.example.com/thet",
  githubUrl: "https://github.com/naingoted",
  contactEmail: "naingoted@gmail.com",
  botName: "meclaw",
  botTagline: "",
  brandLogoUrl: "",
  brandAccent: "",
};

vi.mock("@meclaw/core/settings", () => ({
  defaultSettings: vi.fn(() => ({
    agents: {},
    shared: { persona: "" },
    rag: {
      topK: 4,
      scoreThreshold: 0,
      gapMatchThreshold: 0.15,
      scoreFloor: 0.35,
      clusterRadius: 0.15,
    },
    public: publicSettings,
  })),
  getSettings: vi.fn(),
  getSettingsVersion: vi.fn(),
}));

vi.mock("@/lib/embed/auth", () => ({
  getChatDb: vi.fn(),
  resolveEmbedClient: vi.fn(),
}));

vi.mock("@/components/chat/chat", () => ({
  Chat: vi.fn(() => <div data-testid="chat">Chat Component</div>),
}));

import { getSettings, getSettingsVersion } from "@meclaw/core/settings";
import { Chat } from "@/components/chat/chat";
import { resolveEmbedClient } from "@/lib/embed/auth";

describe("WidgetPage", () => {
  beforeEach(() => {
    vi.mocked(resolveEmbedClient).mockReset();
    vi.mocked(getSettings).mockReset();
    vi.mocked(getSettingsVersion).mockReset();
    vi.mocked(getSettings).mockResolvedValue({
      agents: {},
      shared: { persona: "" },
      rag: {
        topK: 4,
        scoreThreshold: 0,
        gapMatchThreshold: 0.15,
        scoreFloor: 0.35,
        clusterRadius: 0.15,
      },
      public: publicSettings,
    });
    vi.mocked(getSettingsVersion).mockResolvedValue("2026-06-12T10:00:00.000Z");
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
    expect(vi.mocked(Chat)).toHaveBeenCalledWith(
      expect.objectContaining({
        greeting: "Hi from admin",
        suggestions: ["One", "Two", "Three"],
        initialConfigVersion: "2026-06-12T10:00:00.000Z",
      }),
      undefined,
    );
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
