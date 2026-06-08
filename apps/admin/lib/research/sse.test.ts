import { describe, expect, it } from "vitest";
import { parseResearchFrame } from "./sse";

describe("parseResearchFrame", () => {
  it("parses a data-status part", () => {
    expect(
      parseResearchFrame(
        'data: {"type":"data-status","data":{"label":"Planning research","stage":"plan"},"transient":true}\n\n',
      ),
    ).toEqual({ kind: "status", label: "Planning research", stage: "plan" });
  });

  it("parses a data-report part", () => {
    const ev = parseResearchFrame(
      'data: {"type":"data-report","data":{"report":{"summary":"x","matched_strengths":[],"gaps":[],"talking_points":[],"sources":[]},"status":"degraded"}}',
    );
    expect(ev).toMatchObject({ kind: "report", status: "degraded" });
    expect((ev as { report: { summary: string } }).report.summary).toBe("x");
  });

  it("returns null for invalid JSON", () => {
    expect(parseResearchFrame('data: {"type":')).toBeNull();
  });

  it("returns null when data-status is missing label", () => {
    expect(parseResearchFrame('data: {"type":"data-status","data":{"stage":"plan"}}')).toBeNull();
  });

  it("falls back to done for invalid data-report status", () => {
    expect(
      parseResearchFrame(
        'data: {"type":"data-report","data":{"report":{"summary":"x","matched_strengths":[],"gaps":[],"talking_points":[],"sources":[]},"status":"paused"}}',
      ),
    ).toMatchObject({ kind: "report", status: "done" });
  });

  it("returns done on [DONE], null on keep-alives and unconsumed parts", () => {
    expect(parseResearchFrame("data: [DONE]")).toEqual({ kind: "done" });
    expect(parseResearchFrame(": ping")).toBeNull();
    expect(parseResearchFrame('data: {"type":"start"}')).toBeNull();
    expect(parseResearchFrame("")).toBeNull();
  });
});
