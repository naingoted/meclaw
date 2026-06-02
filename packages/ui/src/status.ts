export type StatusTone = "neutral" | "running" | "success" | "danger" | "warning";

export function relativeTime(value: Date | string | number, now: number = Date.now()): string {
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const s = Math.floor(Math.max(0, now - ts) / 1000);
  if (s < 45) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "running": return "running";
    case "succeeded":
    case "ready": return "success";
    case "failed":
    case "error": return "danger";
    case "dirty": return "warning";
    default: return "neutral";
  }
}

export type StatusCounts = { dirty: number; queued: number; running: number; succeeded: number; failed: number };

export function deriveStatusCounts(jobs: { status: string }[], dirty = 0): StatusCounts {
  const counts: StatusCounts = { dirty, queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const j of jobs) {
    if (j.status === "queued") counts.queued++;
    else if (j.status === "running") counts.running++;
    else if (j.status === "succeeded") counts.succeeded++;
    else if (j.status === "failed") counts.failed++;
  }
  return counts;
}
