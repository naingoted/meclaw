import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearResumeEntry,
  getSession,
  listSessions,
  MAIN_RESUME_KEY,
  migrateLegacyEntry,
  readResumeEntry,
  removeSession,
  setSessionTitle,
  setSessionToken,
  upsertSession,
  writeResumeEntry,
} from "./sessions";

describe("embed single-entry helpers", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a resume entry by embed token", () => {
    writeResumeEntry("pk_a", { conversationId: "c1", resumeToken: "rt1" });
    expect(readResumeEntry("pk_a")).toEqual({ conversationId: "c1", resumeToken: "rt1" });
  });

  it("returns null for a missing or malformed entry", () => {
    expect(readResumeEntry("pk_missing")).toBeNull();
    localStorage.setItem("meclaw:resume:pk_bad", "{not json");
    expect(readResumeEntry("pk_bad")).toBeNull();
  });

  it("clears an entry", () => {
    writeResumeEntry("pk_a", { conversationId: "c1", resumeToken: "rt1" });
    clearResumeEntry("pk_a");
    expect(readResumeEntry("pk_a")).toBeNull();
  });
});

describe("session index", () => {
  beforeEach(() => localStorage.clear());

  it("upserts and lists newest-updated first", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    upsertSession({ conversationId: "a" });
    vi.spyOn(Date, "now").mockReturnValue(2000);
    upsertSession({ conversationId: "b" });
    expect(listSessions().map((s) => s.conversationId)).toEqual(["b", "a"]);
    vi.restoreAllMocks();
  });

  it("merges fields and bumps updatedAt on re-upsert", () => {
    upsertSession({ conversationId: "a", title: "first" });
    upsertSession({ conversationId: "a", resumeToken: "rt" });
    expect(getSession("a")).toMatchObject({ title: "first", resumeToken: "rt" });
    expect(listSessions()).toHaveLength(1);
  });

  it("setSessionToken stores the token", () => {
    setSessionToken("a", "rt-9");
    expect(getSession("a")?.resumeToken).toBe("rt-9");
  });

  it("setSessionTitle sets once, ignores later/empty values", () => {
    upsertSession({ conversationId: "a" });
    setSessionTitle("a", "   ");
    expect(getSession("a")?.title).toBe("");
    setSessionTitle("a", "Hello world");
    setSessionTitle("a", "later title");
    expect(getSession("a")?.title).toBe("Hello world");
  });

  it("removeSession drops the entry", () => {
    upsertSession({ conversationId: "a" });
    removeSession("a");
    expect(getSession("a")).toBeNull();
  });

  it("migrates a legacy __main__ entry into an empty index and drops the legacy key", () => {
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "old", resumeToken: "rt-old" });
    migrateLegacyEntry();
    expect(getSession("old")).toMatchObject({ conversationId: "old", resumeToken: "rt-old" });
    expect(readResumeEntry(MAIN_RESUME_KEY)).toBeNull();
  });

  it("does not migrate when the index already has sessions", () => {
    upsertSession({ conversationId: "existing" });
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "old", resumeToken: "rt-old" });
    migrateLegacyEntry();
    expect(getSession("old")).toBeNull();
  });
});

describe("indexKey (internal, tested via listSessions)", () => {
  beforeEach(() => localStorage.clear());

  it("writes namespaced index under meclaw:sessions:<scope>", () => {
    upsertSession({ conversationId: "a", scope: "pk_abc" });
    // The entry lives in the namespaced key, NOT the global key
    expect(localStorage.getItem("meclaw:sessions:pk_abc")).toBeTruthy();
    expect(localStorage.getItem("meclaw:sessions")).toBeNull();
    expect(listSessions({ scope: "pk_abc" })).toHaveLength(1);
    expect(listSessions()).toEqual([]);
  });

  it("omitting scope routes to the global meclaw:sessions key", () => {
    upsertSession({ conversationId: "a" });
    expect(localStorage.getItem("meclaw:sessions")).toBeTruthy();
    expect(localStorage.getItem("meclaw:sessions:pk_abc")).toBeNull();
  });
});

describe("degradation (never throws)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns empty/null when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(listSessions()).toEqual([]);
    expect(readResumeEntry("pk_a")).toBeNull();
  });

  it("does not throw when localStorage.setItem throws (quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => upsertSession({ conversationId: "a" })).not.toThrow();
  });
});
