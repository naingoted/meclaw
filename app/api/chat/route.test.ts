import { describe, expect, it } from "vitest";

/**
 * Tests for the chat route handler.
 * The actual integration is tested via the browser (Playwright MCP).
 * Unit tests verify that tools are configured correctly.
 */

describe("POST /api/chat", () => {
  it("route exports POST handler", async () => {
    // Import the actual route to verify it exports POST
    const routeModule = await import("./route");
    expect(routeModule.POST).toBeDefined();
  });

  it("tools module exports all required tools", async () => {
    // Verify that all 4 tools are exported from the tools module
    const toolsModule = await import("@/lib/ai/tools");
    expect(toolsModule.getContactInfo).toBeDefined();
    expect(toolsModule.scheduleCall).toBeDefined();
    expect(toolsModule.showResume).toBeDefined();
    expect(toolsModule.howThisWorks).toBeDefined();
    expect(toolsModule.tools).toBeDefined();

    // Verify the tools registry has all 4 tools
    const { tools } = toolsModule;
    expect(Object.keys(tools)).toEqual([
      "getContactInfo",
      "scheduleCall",
      "showResume",
      "howThisWorks",
    ]);
  });
});
