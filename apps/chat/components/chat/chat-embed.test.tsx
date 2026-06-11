import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Configurable mock state for useChat — hoisted to module scope
const mockState: {
  messages: unknown[];
  sendMessage: ReturnType<typeof vi.fn>;
  status: "ready" | "submitted" | "streaming" | "error";
  setMessages: ReturnType<typeof vi.fn>;
} = {
  messages: [],
  sendMessage: vi.fn(),
  status: "ready",
  setMessages: vi.fn(),
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => mockState,
}));

const configRefreshPoller = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/components/chat/config-refresh-poller", () => ({
  ConfigRefreshPoller: configRefreshPoller,
}));

// Import AFTER mocks are set up
import { Chat, clearResumeEntry, readResumeEntry, writeResumeEntry } from "@/components/chat/chat";
import { listSessions, upsertSession } from "@/lib/chat/sessions";

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe("readResumeEntry / writeResumeEntry / clearResumeEntry", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: localStorageMock });
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a resume entry", () => {
    const embedToken = "pk_test";
    const entry = { conversationId: "conv-123", resumeToken: "resume-abc" };

    writeResumeEntry(embedToken, entry);
    const result = readResumeEntry(embedToken);

    expect(result).toEqual(entry);
  });

  it("returns null when no entry exists", () => {
    const result = readResumeEntry("pk_missing");
    expect(result).toBeNull();
  });

  it("clears an existing entry", () => {
    const embedToken = "pk_test";
    const entry = { conversationId: "conv-123", resumeToken: "resume-abc" };

    writeResumeEntry(embedToken, entry);
    expect(readResumeEntry(embedToken)).toEqual(entry);

    clearResumeEntry(embedToken);
    expect(readResumeEntry(embedToken)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const embedToken = "pk_bad";
    localStorageMock.setItem(`meclaw:resume:${embedToken}`, "not-json");

    const result = readResumeEntry(embedToken);
    expect(result).toBeNull();
  });

  it("returns null for entry missing required fields", () => {
    const embedToken = "pk_partial";
    localStorageMock.setItem(
      `meclaw:resume:${embedToken}`,
      JSON.stringify({ conversationId: "only-id" }),
    );

    const result = readResumeEntry(embedToken);
    expect(result).toBeNull();
  });

  it("returns null when localStorage throws (private browsing)", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("Quota exceeded");
      },
      setItem: () => {
        throw new Error("Quota exceeded");
      },
      removeItem: () => {
        throw new Error("Quota exceeded");
      },
      clear: () => {},
    };

    vi.stubGlobal("window", { localStorage: throwingStorage });

    // readResumeEntry should gracefully return null
    const result = readResumeEntry("pk_throw");
    expect(result).toBeNull();

    // writeResumeEntry should not throw
    expect(() =>
      writeResumeEntry("pk_throw", { conversationId: "c", resumeToken: "r" }),
    ).not.toThrow();

    // clearResumeEntry should not throw
    expect(() => clearResumeEntry("pk_throw")).not.toThrow();
  });

  it("returns null in SSR (no window)", () => {
    vi.stubGlobal("window", undefined);

    const result = readResumeEntry("pk_ssr");
    expect(result).toBeNull();
  });

  it("does nothing in SSR (no window) for write/clear", () => {
    vi.stubGlobal("window", undefined);

    // Should not throw and should do nothing
    expect(() =>
      writeResumeEntry("pk_ssr", { conversationId: "c", resumeToken: "r" }),
    ).not.toThrow();
    expect(() => clearResumeEntry("pk_ssr")).not.toThrow();
  });
});

describe("Chat component — embed mode resume integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use jsdom's native localStorage directly — don't stub window, which
    // breaks jsdom's window identity and prevents React effects from firing.
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    // Reset mockState properties IN PLACE — reassigning the object would
    // break the useChat mock which captured the original reference at module
    // load time (vi.mock factories run once).
    mockState.messages = [];
    mockState.sendMessage = vi.fn();
    mockState.status = "ready";
    mockState.setMessages = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("embedToken and parentOrigin are passed in sendMessage body when mode=embed", () => {
    const mockSend = vi.fn();
    mockState.sendMessage = mockSend;
    mockState.messages = [];
    mockState.status = "ready";

    // Pre-populate localStorage with a resume entry to skip history fetch
    const embedToken = "pk_embed";
    const parentOrigin = "https://acme.com";
    const entry = { conversationId: "conv-resumed", resumeToken: "rt-resumed" };
    localStorage.setItem(`meclaw:resume:${embedToken}`, JSON.stringify(entry));

    // Mock fetch to return 200 (no messages) so the history fetch doesn't interfere
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ conversationId: "conv-resumed", messages: [] }), {
            status: 200,
          }),
        ),
      ),
    );

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
      />,
    );

    // Click the chip to trigger sendMessage
    const chipButton = screen.getByRole("button", { name: "chip" });
    fireEvent.click(chipButton);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, options] = mockSend.mock.calls[0];
    expect(options?.body?.conversationId).toBe("conv-resumed");
    expect(options?.body?.embedToken).toBe(embedToken);
    expect(options?.body?.parentOrigin).toBe(parentOrigin);
  });

  it("history fetch handles failure without clearing legacy entry (migration owns cleanup)", async () => {
    const embedToken = "pk_fail";
    const parentOrigin = "https://acme.com";
    const entry = { conversationId: "conv-fail", resumeToken: "rt-fail" };
    localStorage.setItem(`meclaw:resume:${embedToken}`, JSON.stringify(entry));

    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: "invalid" }), { status: 401 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
      />,
    );

    // Wait for the async fetch to complete
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // setMessages should not have been called (fetch failed)
    expect(mockState.setMessages).not.toHaveBeenCalled();
    // Migration consumed the legacy key on mount; fetch failure removed the session from the index.
    expect(localStorage.getItem(`meclaw:resume:${embedToken}`)).toBeNull();
    expect(listSessions({ scope: embedToken })).toEqual([]);
  });

  it("history fetch populates messages on success", async () => {
    const embedToken = "pk_success";
    const parentOrigin = "https://acme.com";
    const entry = { conversationId: "conv-ok", resumeToken: "rt-ok" };
    localStorage.setItem(`meclaw:resume:${embedToken}`, JSON.stringify(entry));

    const historyMessages = [
      { id: "m1", role: "user", content: "hello" },
      { id: "m2", role: "assistant", content: "hi there" },
    ];

    // Mock fetch to return 200 with history
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ conversationId: "conv-ok", messages: historyMessages }), {
            status: 200,
          }),
        ),
      ),
    );

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
      />,
    );

    // Poll until setMessages is called (effect + fetch are async)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout waiting for setMessages")), 2000);
      const interval = setInterval(() => {
        if (mockState.setMessages.mock.calls.length > 0) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 10);
    });

    const calledWith = mockState.setMessages.mock.calls[0][0];
    expect(calledWith).toHaveLength(2);
    expect(calledWith[0]).toEqual({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    });
    expect(calledWith[1]).toEqual({
      id: "m2",
      role: "assistant",
      parts: [{ type: "text", text: "hi there" }],
    });

    // Migration consumed the legacy key on mount; the session is in the namespaced index.
    expect(localStorage.getItem(`meclaw:resume:${embedToken}`)).toBeNull();
    const sessions = listSessions({ scope: embedToken });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].conversationId).toBe("conv-ok");
  });

  it("normal mode does not pass embedToken in sendMessage body", () => {
    const mockSend = vi.fn();
    mockState.sendMessage = mockSend;
    mockState.messages = [];
    mockState.status = "ready";

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="normal"
        // embedToken intentionally not passed
      />,
    );

    const chipButton = screen.getByRole("button", { name: "chip" });
    fireEvent.click(chipButton);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, options] = mockSend.mock.calls[0];
    expect(options?.body?.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(options?.body?.embedToken).toBeUndefined();
  });

  it("Escape key posts meclaw:close in embed mode", () => {
    mockState.messages = [];
    mockState.status = "ready";
    const embedToken = "pk_esc";
    const parentOrigin = "https://acme.com";
    localStorage.setItem(
      `meclaw:resume:${embedToken}`,
      JSON.stringify({ conversationId: "c", resumeToken: "r" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ conversationId: "c", messages: [] }), { status: 200 }),
        ),
      ),
    );
    const postMessageSpy = vi.fn();
    Object.defineProperty(window, "parent", {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    });

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
        parentOrigin={parentOrigin}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(postMessageSpy).toHaveBeenCalledWith({ type: "meclaw:close", version: 1 }, parentOrigin);

    // Cleanup
    Object.defineProperty(window, "parent", {
      value: window,
      writable: true,
      configurable: true,
    });
  });

  it("Escape key does NOT post meclaw:close in normal mode", () => {
    mockState.messages = [];
    mockState.status = "ready";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ conversationId: "x", messages: [] }), { status: 200 }),
        ),
      ),
    );
    const postMessageSpy = vi.fn();
    Object.defineProperty(window, "parent", {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    });

    render(<Chat greeting="Hi" suggestions={["chip"]} initialConfigVersion="0" mode="normal" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(postMessageSpy).not.toHaveBeenCalled();

    // Cleanup
    Object.defineProperty(window, "parent", {
      value: window,
      writable: true,
      configurable: true,
    });
  });
});

describe("Chat component — embed multi-session history", () => {
  beforeEach(() => {
    localStorage.clear();
    mockState.messages = [];
    mockState.sendMessage = vi.fn();
    mockState.status = "ready";
    mockState.setMessages = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ conversationId: "x", messages: [] }), { status: 200 }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the history drawer in embed mode and lists a stored session", () => {
    const embedToken = "pk_history";
    upsertSession({ conversationId: "conv-past", title: "Past embed chat", scope: embedToken });
    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(screen.getByText("Past embed chat")).toBeInTheDocument();
  });

  it("does not cross-contaminate sessions across different embedTokens", () => {
    upsertSession({ conversationId: "acme-1", title: "Acme chat", scope: "pk_acme" });
    upsertSession({ conversationId: "other-1", title: "Other chat", scope: "pk_other" });

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken="pk_acme"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(screen.getByText("Acme chat")).toBeInTheDocument();
    expect(screen.queryByText("Other chat")).not.toBeInTheDocument();
  });

  it("migrates a legacy resume entry into the namespaced index on mount", () => {
    const embedToken = "pk_legacy";
    localStorage.setItem(
      `meclaw:resume:${embedToken}`,
      JSON.stringify({ conversationId: "legacy-conv", resumeToken: "legacy-rt" }),
    );

    render(
      <Chat
        greeting="Hi"
        suggestions={["chip"]}
        initialConfigVersion="0"
        mode="embed"
        embedToken={embedToken}
      />,
    );

    // Migration is synchronous in the useState initializer, so the index is
    // populated before the first render.
    const sessions = listSessions({ scope: embedToken });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].conversationId).toBe("legacy-conv");
    // Legacy key is consumed
    expect(localStorage.getItem(`meclaw:resume:${embedToken}`)).toBeNull();
  });
});
