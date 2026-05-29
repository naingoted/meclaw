import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Configurable mock state for useChat
let mockState: {
  messages: unknown[];
  sendMessage: ReturnType<typeof vi.fn>;
  status: "ready";
} = {
  messages: [],
  sendMessage: vi.fn(),
  status: "ready",
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => mockState,
}));

import { Chat } from "@/components/chat/chat";

describe("Chat component — M4 behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state for each test
    mockState = {
      messages: [],
      sendMessage: vi.fn(),
      status: "ready",
    };
  });

  it("renders greeting and all 3 suggestion chips when messages are empty", () => {
    render(<Chat />);

    // Assert greeting is rendered
    expect(screen.getByText(/Hi! I'm echo, Thet's AI twin/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ask me anything about his work, skills, or projects/)
    ).toBeInTheDocument();

    // Assert all 3 suggestion chips are rendered with exact text
    expect(
      screen.getByRole("button", { name: "What's Thet's tech stack?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Walk me through a recent project" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How do I get in touch?" })
    ).toBeInTheDocument();
  });

  it("sends message when a suggestion chip is clicked", () => {
    const mockSend = vi.fn();
    mockState.sendMessage = mockSend;

    render(<Chat />);

    // Click the first chip
    const chipButton = screen.getByRole("button", {
      name: "What's Thet's tech stack?",
    });
    fireEvent.click(chipButton);

    // Assert sendMessage was called exactly once with the chip's text
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      text: "What's Thet's tech stack?",
    });
  });

  it("hides greeting and chips when conversation has messages", () => {
    // Set up non-empty message state
    mockState.messages = [
      {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello there" }],
      },
      {
        id: "2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Hi! How can I help?" }],
      },
    ];

    render(<Chat />);

    // Assert greeting is NOT rendered
    expect(
      screen.queryByText(/Hi! I'm echo, Thet's AI twin/)
    ).not.toBeInTheDocument();

    // Assert suggestion chips are NOT rendered
    expect(
      screen.queryByRole("button", { name: "What's Thet's tech stack?" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Walk me through a recent project" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "How do I get in touch?" })
    ).not.toBeInTheDocument();

    // Assert messages are still rendered
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });
});
