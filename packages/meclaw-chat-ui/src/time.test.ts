import { describe, expect, it } from "vitest";
import { formatDayLabel, formatTime, isSameDay } from "./time";

const NOON = new Date(2026, 5, 10, 14, 5).getTime();

describe("formatTime", () => {
  it("formats hour:minute", () => {
    expect(formatTime(NOON)).toMatch(/\b2:05\b|14:05/);
  });
});

describe("isSameDay", () => {
  it("is true within the same calendar day", () => {
    const morning = new Date(2026, 5, 10, 8, 0).getTime();
    expect(isSameDay(NOON, morning)).toBe(true);
  });
  it("is false across days", () => {
    const nextDay = new Date(2026, 5, 11, 8, 0).getTime();
    expect(isSameDay(NOON, nextDay)).toBe(false);
  });
});

describe("formatDayLabel", () => {
  it("returns Today for the same day as now", () => {
    expect(formatDayLabel(NOON, NOON)).toBe("Today");
  });
  it("returns Yesterday for the prior day", () => {
    const yest = new Date(2026, 5, 9, 9, 0).getTime();
    expect(formatDayLabel(yest, NOON)).toBe("Yesterday");
  });
  it("returns a short date for older days", () => {
    const old = new Date(2026, 5, 8, 9, 0).getTime();
    expect(formatDayLabel(old, NOON)).toMatch(/Jun 8/);
  });
});
