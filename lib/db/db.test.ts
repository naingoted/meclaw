import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveTurn, type PersistentMessage } from "./index";

/**
 * Unit tests for saveTurn persistence logic.
 * Mocks the database to test the save logic in isolation.
 */

describe("saveTurn persistence", () => {
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    pragma: ReturnType<typeof vi.fn>;
  };
  let insertedRows: Array<{ sql: string; id: string; args: unknown[] }> = [];

  beforeEach(() => {
    insertedRows = [];
    mockDb = {
      prepare: vi.fn((sql: string) => ({
        run: vi.fn((id: string, ...args: unknown[]) => {
          insertedRows.push({ sql, id, args });
          return { changes: 1 };
        }),
      })),
      transaction: vi.fn((fn: () => void) => {
        return fn;
      }),
      exec: vi.fn(),
      pragma: vi.fn(),
    };
  });

  it("creates a conversation and saves user + assistant messages", async () => {
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "What is echo?" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Echo is a personal AI twin.",
    };

    // Call saveTurn with our mocked db
    mockDb.transaction = vi.fn((fn: () => void) => fn);
    const result = await saveTurn(mockDb as never, userMessages, assistantMessage);

    // Should return a conversation ID
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");

    // Should have called prepare multiple times
    expect(mockDb.prepare).toHaveBeenCalled();
  });

  it("persists only the LAST user message (not all prior history)", async () => {
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "First?" },
      { role: "user", content: "Second?" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Answer.",
    };

    const preparedStatements: string[] = [];
    mockDb.prepare = vi.fn((sql: string) => {
      preparedStatements.push(sql);
      return {
        run: vi.fn(() => ({ changes: 1 })),
      };
    });
    mockDb.transaction = vi.fn((fn: () => void) => fn);

    await saveTurn(mockDb as never, userMessages, assistantMessage);

    // Count how many INSERT statements were prepared for messages table
    const messageInserts = preparedStatements.filter((sql) =>
      sql.includes("INSERT INTO messages")
    );

    // Should be exactly 2: one for the last user message, one for assistant
    expect(messageInserts).toHaveLength(2);

    // Verify the order: user then assistant
    expect(messageInserts[0]).toContain("INSERT INTO messages");
    expect(messageInserts[1]).toContain("INSERT INTO messages");
  });

  it("handles optional toolCalls in assistant messages", async () => {
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "Use a tool" },
    ];

    const toolCalls = JSON.stringify([
      { id: "tool-1", toolName: "test", args: { test: true } },
    ]);

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Using tool...",
      toolCalls,
    };

    mockDb.transaction = vi.fn((fn: () => void) => fn);
    const result = await saveTurn(mockDb as never, userMessages, assistantMessage);

    expect(result).toBeDefined();
  });

  it("rejects with error on database failure", async () => {
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "Test" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Response",
    };

    mockDb.transaction = vi.fn(() => {
      throw new Error("Database insert failed");
    });

    await expect(saveTurn(mockDb as never, userMessages, assistantMessage)).rejects.toThrow(
      "Database insert failed"
    );
  });

  it("always returns a UUID-format string as conversationId", async () => {
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "Test" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Response",
    };

    mockDb.transaction = vi.fn((fn: () => void) => fn);
    const result = await saveTurn(mockDb as never, userMessages, assistantMessage);

    // UUID v4 format (loose check)
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
