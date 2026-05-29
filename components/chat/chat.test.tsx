import { describe, expect, it, vi } from "vitest";

// Mock useChat to avoid network calls during tests
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: () => {},
    status: "ready",
  }),
}));

/**
 * Chat component tests for M4 (greeting + suggestion chips + avatar).
 * Note: The main validation is via browser verification with Playwright MCP.
 * These unit tests verify that the component structure compiles and exports correctly.
 */
describe("Chat component — M4", () => {
  it("component exports successfully", async () => {
    // Just verify the component can be imported (mock prevents useChat errors)
    const { Chat } = await import("@/components/chat/chat");
    expect(Chat).toBeDefined();
    expect(typeof Chat).toBe("function");
  });

  it("chat-layout component exports successfully", async () => {
    const { ChatLayout } = await import("@/components/chat/chat-layout");
    expect(ChatLayout).toBeDefined();
    expect(typeof ChatLayout).toBe("function");
  });

  it("resume route handler exports GET", async () => {
    const resumeRoute = await import("@/app/resume/route");
    expect(resumeRoute.GET).toBeDefined();
  });
});
