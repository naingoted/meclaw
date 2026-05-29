import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { saveTurn, type PersistentMessage } from "./index";
import * as schema from "./schema";

/**
 * Unit tests for saveTurn persistence logic.
 * Includes mocked tests for logic verification and a real integration test
 * using an in-memory better-sqlite3 database with Drizzle ORM.
 */

describe("saveTurn persistence (mocked)", () => {
  it("returns a UUID-format string as conversationId", async () => {
    const mockDb = {
      transaction: (fn: () => void) => {
        fn();
      },
      insert: () => ({
        values: () => ({
          execute: () => undefined,
        }),
      }),
    };

    const userMessages: PersistentMessage[] = [
      { role: "user", content: "Test" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "Response",
    };

    // Mock the transaction to allow the call without errors
    const result = await saveTurn(mockDb as never, userMessages, assistantMessage);

    // UUID v4 format (loose check)
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("saveTurn persistence (integration with real DB)", () => {
  it("persists exactly one user + one assistant message per turn (no duplicates)", async () => {
    // Create an in-memory SQLite database with schema
    const sqlite = new Database(":memory:");

    // Create tables
    sqlite.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        visitorMeta TEXT
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        toolCalls TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX idx_messages_conversationId ON messages(conversationId);
    `);

    const db = drizzle(sqlite, { schema });

    // Save a turn
    const userMessages: PersistentMessage[] = [
      { role: "user", content: "First message" },
    ];

    const assistantMessage: PersistentMessage = {
      role: "assistant",
      content: "First response",
    };

    const convId1 = await saveTurn(db, userMessages, assistantMessage);

    // Verify first conversation
    interface CountRow {
      count: number;
    }
    interface RoleRow {
      role: string;
    }
    interface ContentRow {
      content: string;
    }

    const countRows = sqlite
      .prepare("SELECT COUNT(*) as count FROM messages WHERE conversationId = ?")
      .all(convId1) as CountRow[];
    expect(countRows[0].count).toBe(2); // 1 user + 1 assistant

    // Save another turn (simulating a second request with same client history)
    const userMessages2: PersistentMessage[] = [
      { role: "user", content: "First message" }, // Prior message in history
      { role: "user", content: "Second message" }, // New message
    ];

    const assistantMessage2: PersistentMessage = {
      role: "assistant",
      content: "Second response",
    };

    const convId2 = await saveTurn(db, userMessages2, assistantMessage2);

    // Verify second conversation has exactly 1 user (the last one), not both
    const roleRows = sqlite
      .prepare("SELECT role FROM messages WHERE conversationId = ? ORDER BY createdAt")
      .all(convId2) as RoleRow[];
    expect(roleRows).toHaveLength(2); // 1 user + 1 assistant
    expect(roleRows[0].role).toBe("user");
    expect(roleRows[1].role).toBe("assistant");

    // Verify the user message is the LAST one in the input array, not the first
    const userMsg = sqlite
      .prepare("SELECT content FROM messages WHERE conversationId = ? AND role = ?")
      .get(convId2, "user") as ContentRow;
    expect(userMsg.content).toBe("Second message");

    // Verify no duplicate rows across conversations
    const totalRow = sqlite
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as CountRow;
    expect(totalRow.count).toBe(4); // 2 conversations * 2 messages each
  });

  it("persists optional toolCalls in assistant messages", async () => {
    const sqlite = new Database(":memory:");

    sqlite.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        visitorMeta TEXT
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        toolCalls TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX idx_messages_conversationId ON messages(conversationId);
    `);

    const db = drizzle(sqlite, { schema });

    const toolCalls = JSON.stringify([{ id: "tool-1", toolName: "test" }]);

    await saveTurn(db, [{ role: "user", content: "Use tool" }], {
      role: "assistant",
      content: "Using...",
      toolCalls,
    });

    interface ToolCallRow {
      toolCalls: string;
    }
    const row = sqlite
      .prepare("SELECT toolCalls FROM messages WHERE role = ?")
      .get("assistant") as ToolCallRow;
    expect(row.toolCalls).toBe(toolCalls);
  });
});
