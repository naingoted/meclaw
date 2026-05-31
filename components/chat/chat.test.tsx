import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Configurable mock state for useChat
let mockState: {
  messages: unknown[];
  sendMessage: ReturnType<typeof vi.fn>;
  status: "ready" | "submitted" | "streaming" | "error";
} = {
  messages: [],
  sendMessage: vi.fn(),
  status: "ready",
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => mockState,
}));

import {
  Chat,
  shouldShowThinking,
  appendStep,
  extractSteps,
  hasRenderedText,
  LiveTrace,
} from "@/components/chat/chat";

describe("shouldShowThinking", () => {
  const userMsg = { role: "user", parts: [{ type: "text", text: "hi" }] };
  const assistantWithText = {
    role: "assistant",
    parts: [{ type: "text", text: "Thet uses Python." }],
  };
  const assistantEmpty = { role: "assistant", parts: [] };

  it("shows while waiting for the first token (submitted)", () => {
    expect(shouldShowThinking("submitted", [userMsg])).toBe(true);
  });

  it("shows while streaming if no assistant text has arrived yet", () => {
    expect(shouldShowThinking("streaming", [userMsg])).toBe(true);
    expect(shouldShowThinking("streaming", [userMsg, assistantEmpty])).toBe(true);
  });

  it("hides once assistant text is streaming in", () => {
    expect(shouldShowThinking("streaming", [userMsg, assistantWithText])).toBe(false);
  });

  it("hides when idle or errored", () => {
    expect(shouldShowThinking("ready", [userMsg, assistantWithText])).toBe(false);
    expect(shouldShowThinking("error", [userMsg])).toBe(false);
  });
});

describe("appendStep", () => {
  it("appends a new label", () => {
    expect(appendStep(["Routing your question…"], "Searching knowledge base…")).toEqual([
      "Routing your question…",
      "Searching knowledge base…",
    ]);
  });

  it("dedupes a consecutive duplicate label", () => {
    expect(appendStep(["Routing your question…"], "Routing your question…")).toEqual([
      "Routing your question…",
    ]);
  });

  it("appends to an empty list", () => {
    expect(appendStep([], "Routing your question…")).toEqual(["Routing your question…"]);
  });
});

describe("extractSteps", () => {
  it("returns the ordered steps for an assistant message", () => {
    expect(
      extractSteps({
        role: "assistant",
        metadata: { steps: ["Routing your question…", "Writing the answer…"] },
      }),
    ).toEqual(["Routing your question…", "Writing the answer…"]);
  });

  it("returns [] for a user message", () => {
    expect(
      extractSteps({ role: "user", metadata: { steps: ["Routing your question…"] } }),
    ).toEqual([]);
  });

  it("returns [] when metadata is missing or malformed", () => {
    expect(extractSteps({ role: "assistant" })).toEqual([]);
    expect(extractSteps({ role: "assistant", metadata: { steps: "nope" } })).toEqual([]);
    expect(extractSteps({ role: "assistant", metadata: { steps: [1, 2] } })).toEqual([]);
    expect(extractSteps({ role: "assistant", metadata: { steps: ["", "  "] } })).toEqual([]);
  });

  it("is NOT dev-gated — returns steps in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      extractSteps({
        role: "assistant",
        metadata: { steps: ["Routing your question…"] },
      }),
    ).toEqual(["Routing your question…"]);
  });
});

describe("hasRenderedText", () => {
  it("is true once an assistant message has non-empty text", () => {
    expect(
      hasRenderedText({ parts: [{ type: "text", text: "Python." }] }),
    ).toBe(true);
  });

  it("is false for an empty or text-less message (pre-token window)", () => {
    expect(hasRenderedText({ parts: [] })).toBe(false);
    expect(hasRenderedText({ parts: [{ type: "text", text: "" }] })).toBe(false);
    expect(hasRenderedText({})).toBe(false);
  });
});

describe("Chat component — M4 behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Reset mock state for each test
    mockState = {
      messages: [],
      sendMessage: vi.fn(),
      status: "ready",
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("disables Send button when streaming", () => {
    mockState.status = "streaming";

    render(<Chat />);

    // Assert Send button is disabled during streaming
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
  });

  it("shows a thinking indicator while waiting for the first token", () => {
    mockState.status = "submitted";
    mockState.messages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "stack?" }] },
    ];

    render(<Chat />);

    expect(screen.getByText(/Thinking…/i)).toBeInTheDocument();
  });

  it("does not show a thinking indicator once idle", () => {
    mockState.status = "ready";
    mockState.messages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "stack?" }] },
      { id: "2", role: "assistant" as const, parts: [{ type: "text" as const, text: "Python." }] },
    ];

    render(<Chat />);

    expect(screen.queryByText(/Thinking…/i)).not.toBeInTheDocument();
  });

  it("renders assistant sources in dev mode when metadata includes sources", () => {
    mockState.messages = [
      {
        id: "2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Here is a sourced answer." }],
        metadata: {
          sources: [
            {
              title: "Projects",
              slug: "content/projects.md",
              score: 0.8742,
            },
          ],
        },
      },
    ];

    render(<Chat />);

    expect(screen.getByText("Sources used")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("content/projects.md")).toBeInTheDocument();
    expect(screen.getByText("Score 0.87")).toBeInTheDocument();
  });

  it("does not render sources for user messages", () => {
    mockState.messages = [
      {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello there" }],
        metadata: {
          sources: [
            {
              title: "Projects",
              path: "content/projects.md",
              score: 0.8742,
            },
          ],
        },
      },
    ];

    render(<Chat />);

    expect(screen.queryByText("Sources used")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  it("does not render sources in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.messages = [
      {
        id: "2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Here is a sourced answer." }],
        metadata: {
          sources: [
            {
              title: "Projects",
              source: "content/projects.md",
              score: 0.8742,
            },
          ],
        },
      },
    ];

    render(<Chat />);

    expect(screen.queryByText("Sources used")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  it("renders the routed intent in the dev panel for assistant messages", () => {
    mockState.messages = [
      {
        id: "a1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Thet uses Python." }],
        metadata: {
          sources: [{ source: "about.md", title: "About", score: 0.8 }],
          route: "tech",
          intent: "tech",
        },
      },
    ];

    render(<Chat />);

    expect(screen.getByText(/Routed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Routed:\s*tech/i)).toBeInTheDocument();
  });

  it("renders Routed badge even when sources are absent", () => {
    mockState.messages = [
      {
        id: "a2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Sure." }],
        metadata: { route: "general", intent: "general" },
      },
    ];

    render(<Chat />);

    expect(screen.getByText(/Routed:\s*general/i)).toBeInTheDocument();
  });

  it("does not render the Routed badge for user messages", () => {
    mockState.messages = [
      {
        id: "u1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hi" }],
        metadata: { route: "tech", intent: "tech" },
      },
    ];

    render(<Chat />);

    expect(screen.queryByText(/Routed:/i)).not.toBeInTheDocument();
  });

  it("does not render the Routed badge in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.messages = [
      {
        id: "a3",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Sure." }],
        metadata: { route: "tech", intent: "tech" },
      },
    ];

    render(<Chat />);

    expect(screen.queryByText(/Routed:/i)).not.toBeInTheDocument();
  });
});

describe("LiveTrace", () => {
  it("shows a single Thinking… line when no steps yet", () => {
    render(<LiveTrace steps={[]} />);
    expect(screen.getByText(/Thinking…/i)).toBeInTheDocument();
  });

  it("renders each accumulated step, last one active", () => {
    render(
      <LiveTrace steps={["Routing your question…", "Searching knowledge base…"]} />,
    );
    expect(screen.getByText("Routing your question…")).toBeInTheDocument();
    expect(screen.getByText("Searching knowledge base…")).toBeInTheDocument();
    // the active (last) step is marked for assistive tech
    expect(screen.getByText("Searching knowledge base…").closest("li"))
      .toHaveAttribute("data-active", "true");
    expect(screen.getByText("Routing your question…").closest("li"))
      .toHaveAttribute("data-active", "false");
  });
});

describe("ThinkingTrace (persisted How I answered)", () => {
  it("renders a collapsed trace with ordered steps for an assistant message", () => {
    mockState.messages = [
      {
        id: "a1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Thet uses Python." }],
        metadata: {
          steps: ["Routing your question…", "Searching knowledge base…", "Writing the answer…"],
        },
      },
    ];

    render(<Chat />);

    const summary = screen.getByText("How I answered");
    expect(summary).toBeInTheDocument();
    // collapsed by default: the parent <details> has no `open` attribute
    expect(summary.closest("details")).not.toHaveAttribute("open");
    // the steps are present in the DOM
    expect(screen.getByText("Routing your question…")).toBeInTheDocument();
    expect(screen.getByText("Searching knowledge base…")).toBeInTheDocument();
    expect(screen.getByText("Writing the answer…")).toBeInTheDocument();
  });

  it("renders the trace in production (not dev-gated)", () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.messages = [
      {
        id: "a2",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Sure." }],
        metadata: { steps: ["Routing your question…"] },
      },
    ];

    render(<Chat />);

    expect(screen.getByText("How I answered")).toBeInTheDocument();
  });

  it("suppresses the persisted trace while the message has no text yet (pre-token overlap)", () => {
    mockState.status = "streaming";
    mockState.messages = [
      {
        id: "u1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "stack?" }],
      },
      {
        id: "a1",
        role: "assistant" as const,
        parts: [],
        metadata: {
          steps: ["Routing your question…", "Writing the answer…"],
          sources: [{ source: "about.md", title: "About", score: 0.8 }],
          route: "tech",
          intent: "tech",
        },
      },
    ];

    render(<Chat />);

    // metadata arrived early, but the persisted blocks must not coexist with the
    // live checklist — they appear only once answer text starts streaming.
    expect(screen.queryByText("How I answered")).not.toBeInTheDocument();
    expect(screen.queryByText("Sources used")).not.toBeInTheDocument();
  });

  it("renders no trace when steps are absent", () => {
    mockState.messages = [
      {
        id: "a3",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Sure." }],
        metadata: { route: "general", intent: "general" },
      },
    ];

    render(<Chat />);

    expect(screen.queryByText("How I answered")).not.toBeInTheDocument();
  });
});
