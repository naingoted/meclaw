import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearResumeEntry,
  getSession,
  listSessions,
  MAIN_RESUME_KEY,
  migrateEmbedLegacy,
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

describe("session index (options-object API)", () => {
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
    expect(getSession({ conversationId: "a" })).toMatchObject({
      title: "first",
      resumeToken: "rt",
    });
    expect(listSessions()).toHaveLength(1);
  });

  it("setSessionToken stores the token", () => {
    setSessionToken({ conversationId: "a", resumeToken: "rt-9" });
    expect(getSession({ conversationId: "a" })?.resumeToken).toBe("rt-9");
  });

  it("setSessionTitle sets once, ignores later/empty values", () => {
    upsertSession({ conversationId: "a" });
    setSessionTitle({ conversationId: "a", title: "   " });
    expect(getSession({ conversationId: "a" })?.title).toBe("");
    setSessionTitle({ conversationId: "a", title: "Hello world" });
    setSessionTitle({ conversationId: "a", title: "later title" });
    expect(getSession({ conversationId: "a" })?.title).toBe("Hello world");
  });

  it("removeSession drops the entry", () => {
    upsertSession({ conversationId: "a" });
    removeSession({ conversationId: "a" });
    expect(getSession({ conversationId: "a" })).toBeNull();
  });

  it("isolates sessions by scope — no cross-contamination", () => {
    upsertSession({ conversationId: "main-1" }); // global
    upsertSession({ conversationId: "embed-1", scope: "pk_a" });
    upsertSession({ conversationId: "embed-2", scope: "pk_b" });

    expect(listSessions().map((s) => s.conversationId)).toEqual(["main-1"]);
    expect(listSessions({ scope: "pk_a" }).map((s) => s.conversationId)).toEqual(["embed-1"]);
    expect(listSessions({ scope: "pk_b" }).map((s) => s.conversationId)).toEqual(["embed-2"]);

    // getSession is scoped
    expect(getSession({ conversationId: "embed-1" })).toBeNull(); // not in global
    expect(getSession({ scope: "pk_a", conversationId: "embed-1" })).not.toBeNull();
    expect(getSession({ scope: "pk_b", conversationId: "embed-1" })).toBeNull(); // wrong scope

    // removeSession is scoped
    removeSession({ scope: "pk_a", conversationId: "embed-1" });
    expect(listSessions({ scope: "pk_a" })).toEqual([]);
    expect(listSessions({ scope: "pk_b" })).toHaveLength(1); // untouched
  });

  it("setSessionToken and setSessionTitle respect scope", () => {
    upsertSession({ conversationId: "a", scope: "pk_x" });
    setSessionToken({ scope: "pk_x", conversationId: "a", resumeToken: "rt-s-scope" });
    setSessionTitle({ scope: "pk_x", conversationId: "a", title: "scoped title" });
    expect(getSession({ scope: "pk_x", conversationId: "a" })).toMatchObject({
      resumeToken: "rt-s-scope",
      title: "scoped title",
    });
    // not in global
    expect(getSession({ conversationId: "a" })).toBeNull();
  });

  it("migrates a legacy __main__ entry into an empty index and drops the legacy key", () => {
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "old", resumeToken: "rt-old" });
    migrateLegacyEntry();
    expect(getSession({ conversationId: "old" })).toMatchObject({
      conversationId: "old",
      resumeToken: "rt-old",
    });
    expect(readResumeEntry(MAIN_RESUME_KEY)).toBeNull();
  });

  it("does not migrate when the index already has sessions", () => {
    upsertSession({ conversationId: "existing" });
    writeResumeEntry(MAIN_RESUME_KEY, { conversationId: "old", resumeToken: "rt-old" });
    migrateLegacyEntry();
    expect(getSession({ conversationId: "old" })).toBeNull();
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

describe("migrateEmbedLegacy", () => {
  beforeEach(() => localStorage.clear());

  it("folds a legacy single-entry into the namespaced index and deletes the legacy key", () => {
    writeResumeEntry("pk_abc", { conversationId: "legacy-1", resumeToken: "rt-legacy" });

    migrateEmbedLegacy("pk_abc");

    const sessions = listSessions({ scope: "pk_abc" });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      conversationId: "legacy-1",
      resumeToken: "rt-legacy",
      title: "",
    });
    expect(readResumeEntry("pk_abc")).toBeNull();
  });

  it("is a no-op when the namespaced index is non-empty", () => {
    upsertSession({ conversationId: "already-migrated", scope: "pk_abc" });
    writeResumeEntry("pk_abc", { conversationId: "legacy-2", resumeToken: "rt-old" });

    migrateEmbedLegacy("pk_abc");

    expect(listSessions({ scope: "pk_abc" })).toHaveLength(1);
    expect(getSession({ scope: "pk_abc", conversationId: "already-migrated" })).not.toBeNull();
    // legacy key NOT consumed — migration bailed early
    expect(readResumeEntry("pk_abc")).not.toBeNull();
  });

  it("is a no-op when the legacy key is absent", () => {
    expect(() => migrateEmbedLegacy("pk_missing")).not.toThrow();
    expect(listSessions({ scope: "pk_missing" })).toEqual([]);
  });

  it("does not touch the global index or other scopes", () => {
    writeResumeEntry("pk_abc", { conversationId: "c", resumeToken: "r" });
    upsertSession({ conversationId: "main-session" }); // global
    upsertSession({ conversationId: "other-embed", scope: "pk_def" });

    migrateEmbedLegacy("pk_abc");

    expect(listSessions().map((s) => s.conversationId)).toEqual(["main-session"]);
    expect(listSessions({ scope: "pk_def" }).map((s) => s.conversationId)).toEqual(["other-embed"]);
  });

  it("preserves the legacy key when the indexed write silently fails", () => {
    writeResumeEntry("pk_fail", { conversationId: "legacy-x", resumeToken: "rt-x" });

    // Make setItem throw so the indexed write becomes a no-op, but getItem
    // still works (so readResumeEntry returns the legacy entry).
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string) {
      // Only fail for the index key — allow the legacy key reads to work.
      if (key.startsWith("meclaw:sessions")) throw new Error("Quota exceeded");
      realSetItem.call(this, key, arguments[1]);
    };

    try {
      migrateEmbedLegacy("pk_fail");

      // Indexed write failed — legacy key must survive for future recovery.
      expect(listSessions({ scope: "pk_fail" })).toEqual([]);
      expect(readResumeEntry("pk_fail")).toEqual({
        conversationId: "legacy-x",
        resumeToken: "rt-x",
      });
    } finally {
      Storage.prototype.setItem = realSetItem;
    }
  });
});
