import type { BriefingReport, RunStatus } from "./types";

export type ResearchEvent =
  | { kind: "status"; label: string; stage: string }
  | { kind: "report"; report: BriefingReport | null; status: RunStatus }
  | { kind: "done" };

type SsePart =
  | { type: "data-status"; data?: { label?: unknown; stage?: unknown } }
  | { type: "data-report"; data?: { report?: unknown; status?: unknown } }
  | { type?: string; data?: unknown };

function parseReportStatus(status: unknown): RunStatus {
  switch (status) {
    case "running":
    case "done":
    case "degraded":
    case "error":
      return status;
    default:
      return "done";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function parseResearchFrame(frame: string): ResearchEvent | null {
  const line = frame.trim();
  if (!line.startsWith("data:")) return null;

  const payload = line.slice("data:".length).trim();
  if (payload.length === 0) return null;
  if (payload === "[DONE]") return { kind: "done" };

  let part: SsePart;
  try {
    part = JSON.parse(payload) as SsePart;
  } catch {
    return null;
  }

  const data = asRecord(part.data);

  if (part.type === "data-status" && data && typeof data.label === "string") {
    return {
      kind: "status",
      label: data.label,
      stage: typeof data.stage === "string" ? data.stage : "",
    };
  }

  if (part.type === "data-report" && data) {
    return {
      kind: "report",
      report: (data.report ?? null) as BriefingReport | null,
      status: parseReportStatus(data.status),
    };
  }

  return null;
}
