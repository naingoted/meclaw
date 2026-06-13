import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Configurable mock state for useChat
let mockState: {
  messages: unknown[];
  sendMessage: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
  status: "ready" | "submitted" | "streaming" | "error";
} = {
  messages: [],
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  status: "ready",
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => mockState,
}));

const configRefreshPoller = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/components/chat/config-refresh-poller", () => ({
  ConfigRefreshPoller: configRefreshPoller,
}));

import {
  appendStep,
  Chat,
  extractCorpusVersion,
  extractSteps,
  groundingLabel,
  handleResumeTokenEvent,
  hasRenderedText,
  LiveTrace,
  MAIN_RESUME_KEY,
  readResumeEntry,
  shouldRenderMessage,
  shouldShowThinking,
  writeResumeEntry,
} from "@/components/chat/chat";
import { getSession, upsertSession } from "@/lib/chat/sessions";

const CHAT_PROPS = {
  greeting: "Hi! I'm meclaw, an AI assistant.",
  suggestions: [
    "What's Thet's tech stack?",
    "Walk me through a recent project",
    "How do I get in touch?",
  ],
  copy: {
    emptyStateIntro: "Ask me anything about his work, skills, or projects.",
    suggestionsLabel: "Try asking:",
    messagePlaceholder: "Say something…",
    thinkingLabel: "Thinking…",
    footerPrefix: "Built this myself",
    resumeLabel: "Résumé",
    bookCallLabel: "Book a call",
    bookShortLabel: "Book",
    githubLabel: "GitHub",
  },
  initialConfigVersion: "2026-06-03T00:00:00.000Z",
};

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
    expect(extractSteps({ role: "user", metadata: { steps: ["Routing your question…"] } })).toEqual(
      [],
    );
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
    expect(hasRenderedText({ parts: [{ type: "text", text: "Python." }] })).toBe(true);
  });

  it("is false for an empty or text-less message (pre-token window)", () => {
    expect(hasRenderedText({ parts: [] })).toBe(false);
    expect(hasRenderedText({ parts: [{ type: "text", text: "" }] })).toBe(false);
    expect(hasRenderedText({})).toBe(false);
  });
});

describe("shouldRenderMessage", () => {
  it("renders a user message regardless of text", () => {
    expect(shouldRenderMessage({ role: "user", parts: [] })).toBe(true);
  });

  it("renders an assistant message once it has text", () => {
    expect(shouldRenderMessage({ role: "assistant", parts: [{ type: "text", text: "Hi" }] })).toBe(
      true,
    );
  });

  it("suppresses an assistant message that has no text yet (pre-token)", () => {
    expect(shouldRenderMessage({ role: "assistant", parts: [] })).toBe(false);
    expect(shouldRenderMessage({ role: "assistant", parts: [{ type: "text", text: "" }] })).toBe(
      false,
    );
  });
});

describe("bot avatar removed (mobile space recovery)", () => {
  it("does not render any bot-avatar testid", () => {
    mockState.status = "streaming";
    mockState.messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "stack?" }] },
      { id: "a1", role: "assistant", parts: [] },
    ];
    render(<Chat {...CHAT_PROPS} />);
    expect(screen.queryAllByTestId("bot-avatar")).toHaveLength(0);
  });

  it("renders assistant messages with aria-label for screen readers", () => {
    mockState.status = "ready";
    mockState.messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "stack?" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Python." }] },
    ];
    render(<Chat {...CHAT_PROPS} />);
    expect(screen.getByLabelText("Assistant says")).toBeInTheDocument();
  });

  it("renders user messages with aria-label for screen readers", () => {
    mockState.status = "ready";
    mockState.messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] }];
    render(<Chat {...CHAT_PROPS} />);
    expect(screen.getByLabelText("You said")).toBeInTheDocument();
  });
});

describe("Chat component — M4 behavioral tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Reset mock state for each test
    mockState = {
      messages: [],
      sendMessage: vi.fn(),
      setMessages: vi.fn(),
      status: "ready",
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders greeting and all 3 suggestion chips when messages are empty", () => {
    render(<Chat {...CHAT_PROPS} />);

    // Assert greeting is rendered
    expect(screen.getByText(/Hi! I'm meclaw, an AI assistant/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ask me anything about his work, skills, or projects/),
    ).toBeInTheDocument();

    // Assert all 3 suggestion chips are rendered with exact text
    expect(screen.getByRole("button", { name: "What's Thet's tech stack?" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Walk me through a recent project" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How do I get in touch?" })).toBeInTheDocument();
  });

  it("renders the config refresh poller with the initial version and chat status", () => {
    mockState.status = "streaming";

    render(<Chat {...CHAT_PROPS} />);

    expect(configRefreshPoller).toHaveBeenCalledWith(
      {
        initialConfigVersion: "2026-06-03T00:00:00.000Z",
        status: "streaming",
      },
      undefined,
    );
  });

  it("renders the greeting from props (not a hardcoded literal)", () => {
    render(
      <Chat
        greeting="Custom greeting line"
        suggestions={["only chip"]}
        copy={CHAT_PROPS.copy}
        initialConfigVersion="2026-06-03T00:00:00.000Z"
      />,
    );
    expect(screen.getByText("Custom greeting line")).toBeInTheDocument();
  });

  it("renders suggestion chips from props", () => {
    render(
      <Chat
        greeting="g"
        suggestions={["chip one", "chip two"]}
        copy={CHAT_PROPS.copy}
        initialConfigVersion="2026-06-03T00:00:00.000Z"
      />,
    );
    expect(screen.getByRole("button", { name: "chip one" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "chip two" })).toBeInTheDocument();
  });

  it("sends message when a suggestion chip is clicked", () => {
    const mockSend = vi.fn();
    mockState.sendMessage = mockSend;

    render(<Chat {...CHAT_PROPS} />);

    // Click the first chip
    const chipButton = screen.getByRole("button", {
      name: "What's Thet's tech stack?",
    });
    fireEvent.click(chipButton);

    // Assert sendMessage was called exactly once with the chip's text and conversationId
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message, options] = mockSend.mock.calls[0];
    expect(message).toEqual({
      text: "What's Thet's tech stack?",
    });
    expect(options?.body?.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
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

    render(<Chat {...CHAT_PROPS} />);

    // Assert greeting is NOT rendered
    expect(screen.queryByText(/Hi! I'm meclaw, an AI assistant/)).not.toBeInTheDocument();

    // Assert suggestion chips are NOT rendered
    expect(
      screen.queryByRole("button", { name: "What's Thet's tech stack?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Walk me through a recent project" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "How do I get in touch?" }),
    ).not.toBeInTheDocument();

    // Assert messages are still rendered
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("disables Send button when streaming", () => {
    mockState.status = "streaming";

    render(<Chat {...CHAT_PROPS} />);

    // Assert Send button is disabled during streaming
    const sendButton = screen.getByRole("button", { name: /Send/ });
    expect(sendButton).toBeDisabled();
  });

  it("shows a thinking indicator while waiting for the first token", () => {
    mockState.status = "submitted";
    mockState.messages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "stack?" }] },
    ];

    render(<Chat {...CHAT_PROPS} />);

    expect(screen.getByText(/Thinking…/i)).toBeInTheDocument();
  });

  it("does not show a thinking indicator once idle", () => {
    mockState.status = "ready";
    mockState.messages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "stack?" }] },
      { id: "2", role: "assistant" as const, parts: [{ type: "text" as const, text: "Python." }] },
    ];

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

    expect(screen.queryByText(/Routed:/i)).not.toBeInTheDocument();
  });
});

describe("Chat conversationId threading", () => {
  it("sends a stable conversationId in the request body on submit", async () => {
    const mockSendMessage = vi.fn();
    mockState.sendMessage = mockSendMessage;
    mockState.messages = [];
    mockState.status = "ready";

    render(<Chat {...CHAT_PROPS} />);
    const input = screen.getByPlaceholderText("Say something…");
    fireEvent.change(input, { target: { value: "hello" } });
    const form = input.closest("form");
    fireEvent.submit(form!);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = mockSendMessage.mock.calls[0];
    expect(options?.body?.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("sends a stable conversationId in the request body on chip click", async () => {
    const mockSendMessage = vi.fn();
    mockState.sendMessage = mockSendMessage;
    mockState.messages = [];
    mockState.status = "ready";

    render(<Chat {...CHAT_PROPS} />);
    const chipButton = screen.getByRole("button", {
      name: "What's Thet's tech stack?",
    });
    fireEvent.click(chipButton);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = mockSendMessage.mock.calls[0];
    expect(options?.body?.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe("groundingLabel", () => {
  it("knowledge route with sources => grounded on N sources", () => {
    expect(groundingLabel("tech", 2)).toBe("grounded on 2 sources");
  });

  it("knowledge route with zero sources => no matching corpus content", () => {
    expect(groundingLabel("general", 0)).toBe("no matching corpus content");
  });

  it("non-knowledge route => answered without corpus", () => {
    expect(groundingLabel("scheduler", 0)).toBe("answered without corpus (intent: scheduler)");
  });

  it("gap route => saved answer", () => {
    expect(groundingLabel("gap", 1)).toBe("saved answer");
  });

  it("extractCorpusVersion reads metadata.corpus_version", () => {
    const msg = { role: "assistant", metadata: { corpus_version: 7 } } as never;
    expect(extractCorpusVersion(msg)).toBe(7);
  });
});

describe("LiveTrace", () => {
  it("shows a single Thinking… line when no steps yet", () => {
    render(<LiveTrace steps={[]} />);
    expect(screen.getByText(/Thinking…/i)).toBeInTheDocument();
  });

  it("renders each accumulated step, last one active", () => {
    render(<LiveTrace steps={["Routing your question…", "Searching knowledge base…"]} />);
    expect(screen.getByText("Routing your question…")).toBeInTheDocument();
    expect(screen.getByText("Searching knowledge base…")).toBeInTheDocument();
    // the active (last) step is marked for assistive tech
    expect(screen.getByText("Searching knowledge base…").closest("li")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByText("Routing your question…").closest("li")).toHaveAttribute(
      "data-active",
      "false",
    );
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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

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

    render(<Chat {...CHAT_PROPS} />);

    expect(screen.queryByText("How I answered")).not.toBeInTheDocument();
  });
});

describe("Chat main-chat session persistence (normal mode)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState = {
      messages: [],
      sendMessage: vi.fn(),
      setMessages: vi.fn(),
      status: "ready",
    };
    // The history-fetch effect (Task 4) fires for normal mode once a resume
    // entry exists; stub fetch so it never hits a real network/undefined fetch.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ conversationId: "x", messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("initializes conversationId from localStorage in normal mode", () => {
    writeResumeEntry(MAIN_RESUME_KEY, {
      conversationId: "stored-conv-id",
      resumeToken: "rt-x",
    });
    const mockSendMessage = vi.fn();
    mockState.sendMessage = mockSendMessage;

    render(<Chat {...CHAT_PROPS} />);
    const input = screen.getByPlaceholderText("Say something…");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.submit(input.closest("form")!);

    const [, options] = mockSendMessage.mock.calls[0];
    expect(options?.body?.conversationId).toBe("stored-conv-id");
  });

  it("stores the resume token in the session index on a valid token in normal mode", () => {
    handleResumeTokenEvent(
      { type: "data-resume-token", data: { token: "rt-1", conversationId: "conv-1" } },
      "normal",
      undefined,
    );
    expect(getSession({ conversationId: "conv-1" })).toMatchObject({
      conversationId: "conv-1",
      resumeToken: "rt-1",
    });
  });

  it("stores the resume token in the scoped index in embed mode", () => {
    handleResumeTokenEvent(
      { type: "data-resume-token", data: { token: "rt-embed", conversationId: "conv-e1" } },
      "embed",
      "pk_test",
    );
    expect(getSession({ scope: "pk_test", conversationId: "conv-e1" })).toMatchObject({
      conversationId: "conv-e1",
      resumeToken: "rt-embed",
    });
    // Legacy key is NOT written — embed uses the scoped index exclusively.
    expect(readResumeEntry("pk_test")).toBeNull();
  });
});

describe("Chat main-chat history restore (normal mode)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState = {
      messages: [],
      sendMessage: vi.fn(),
      setMessages: vi.fn(),
      status: "ready",
    };
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("fetches history (no embedToken) and calls setMessages in normal mode", async () => {
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "conv-1", resumeToken: "rt-1" });
    const setMessages = vi.fn();
    mockState.setMessages = setMessages;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: "conv-1",
          messages: [{ id: "m1", role: "user", content: "hello" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Chat {...CHAT_PROPS} />);

    await waitFor(() => expect(setMessages).toHaveBeenCalled());

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/chat/history?");
    expect(calledUrl).toContain("conversationId=conv-1");
    expect(calledUrl).toContain("resumeToken=rt-1");
    expect(calledUrl).not.toContain("embedToken");
    expect(setMessages).toHaveBeenCalledWith([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("forgets the session when history fetch returns 401 (normal mode)", async () => {
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "conv-1", resumeToken: "stale" });
    mockState.setMessages = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    render(<Chat {...CHAT_PROPS} />);

    await waitFor(() => expect(getSession({ conversationId: "conv-1" })).toBeNull());
  });
});

describe("New chat control", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState = { messages: [], sendMessage: vi.fn(), setMessages: vi.fn(), status: "ready" };
  });

  it("clears the transcript when New chat is clicked", () => {
    const setMessages = vi.fn();
    mockState.setMessages = setMessages;
    mockState.messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hello" }] },
    ];
    render(<Chat {...CHAT_PROPS} />);
    // Drop the mount-time loadConversation([]) call so we attribute the clear
    // strictly to the click, not to the no-session resume on mount.
    setMessages.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledWith([]);
  });
});

describe("History drawer wiring (normal mode)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState = { messages: [], sendMessage: vi.fn(), setMessages: vi.fn(), status: "ready" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ conversationId: "x", messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the drawer and lists a stored session", () => {
    upsertSession({ conversationId: "conv-1", title: "Past chat" });
    render(<Chat {...CHAT_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(screen.getByText("Past chat")).toBeInTheDocument();
  });

  it("renders the History button in embed mode (multi-session history)", () => {
    render(<Chat {...CHAT_PROPS} mode="embed" embedToken="pk_a" />);
    expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();
  });

  it("deletes the active conversation and resets to a fresh chat", () => {
    upsertSession({ conversationId: "c1", title: "Active" });
    const setMessages = vi.fn();
    mockState.setMessages = setMessages;
    render(<Chat {...CHAT_PROPS} />); // sole session → c1 is the active conversation
    setMessages.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete conversation/i }));
    expect(getSession({ conversationId: "c1" })).toBeNull();
    expect(setMessages).toHaveBeenCalledWith([]); // startNewChat fired for the active chat
  });

  it("removes a non-active conversation from the open drawer, keeping the active one", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1000);
    upsertSession({ conversationId: "old", title: "Old chat" });
    nowSpy.mockReturnValue(2000);
    upsertSession({ conversationId: "current", title: "Current chat" });
    nowSpy.mockRestore();
    render(<Chat {...CHAT_PROPS} />); // newest (current) is active on mount
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    // newest-first order: [Current chat, Old chat] — delete the second (non-active) row
    const delButtons = screen.getAllByRole("button", { name: /delete conversation/i });
    fireEvent.click(delButtons[1]);
    expect(getSession({ conversationId: "old" })).toBeNull();
    expect(getSession({ conversationId: "current" })).not.toBeNull();
    expect(screen.queryByText("Old chat")).not.toBeInTheDocument();
    expect(screen.getByText("Current chat")).toBeInTheDocument();
  });
});
