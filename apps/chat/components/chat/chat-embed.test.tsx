import { fireEvent, render, screen } from "@testing-library/react";
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

  it("history fetch clears localStorage entry on failure", async () => {
    const embedToken = "pk_fail";
    const parentOrigin = "https://acme.com";
    const entry = { conversationId: "conv-fail", resumeToken: "rt-fail" };
    localStorage.setItem(`meclaw:resume:${embedToken}`, JSON.stringify(entry));

    // Mock fetch to return 401 (stale resume token)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: "invalid" }), { status: 401 })),
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

    // Poll until localStorage entry is cleared (effect + fetch are async)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("timeout waiting for localStorage clear")),
        2000,
      );
      const interval = setInterval(() => {
        if (localStorage.getItem(`meclaw:resume:${embedToken}`) === null) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 10);
    });

    // setMessages should not have been called (fetch failed)
    expect(mockState.setMessages).not.toHaveBeenCalled();
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

    // localStorage entry should NOT be cleared (successful fetch)
    expect(localStorage.getItem(`meclaw:resume:${embedToken}`)).toBe(JSON.stringify(entry));
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
});
