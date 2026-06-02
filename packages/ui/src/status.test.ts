import { describe, it, expect } from "vitest";
import { relativeTime, statusTone, deriveStatusCounts } from "./status";

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  it("renders coarse buckets", () => {
    expect(relativeTime(now - 10_000, now)).toBe("now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2d");
  });
  it("accepts ISO strings and bad input", () => {
    expect(relativeTime(new Date(now - 60_000).toISOString(), now)).toBe("1m");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("statusTone", () => {
  it("maps statuses to tones", () => {
    expect(statusTone("running")).toBe("running");
    expect(statusTone("succeeded")).toBe("success");
    expect(statusTone("ready")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("error")).toBe("danger");
    expect(statusTone("dirty")).toBe("warning");
    expect(statusTone("queued")).toBe("neutral");
    expect(statusTone("whatever")).toBe("neutral");
  });
});

describe("deriveStatusCounts", () => {
  it("counts job statuses and carries dirty through", () => {
    const jobs = [
      { status: "running" }, { status: "failed" }, { status: "failed" },
      { status: "succeeded" }, { status: "queued" },
    ];
    expect(deriveStatusCounts(jobs, 3)).toEqual({
      dirty: 3, queued: 1, running: 1, succeeded: 1, failed: 2,
    });
  });
  it("defaults dirty to 0 and ignores unknown statuses", () => {
    expect(deriveStatusCounts([{ status: "weird" }])).toEqual({
      dirty: 0, queued: 0, running: 0, succeeded: 0, failed: 0,
    });
  });
});
