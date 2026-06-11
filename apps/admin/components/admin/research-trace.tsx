"use client";

import { cn } from "@meclaw/ui";
import type { RunStatus } from "@/lib/research/types";

function markerFor(
  active: boolean,
  last: boolean,
  running: boolean,
  status: RunStatus | null | undefined,
) {
  if (active) {
    return { className: "animate-pulse text-primary", glyph: "▮" };
  }
  if (last && !running && status === "error") {
    return { className: "text-destructive", glyph: "×" };
  }
  if (last && !running && status === "degraded") {
    return { className: "text-accent", glyph: "!" };
  }
  return { className: "text-success", glyph: "✓" };
}

export function ResearchTrace({
  steps,
  running,
  status,
}: {
  steps: string[];
  running: boolean;
  status?: RunStatus | null;
}) {
  return (
    <div className="rounded-sm border border-border bg-card font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-primary">▮</span> trace
      </div>
      <ul aria-live="polite" className="space-y-1 p-3">
        {steps.length === 0 && running ? (
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="animate-pulse text-primary">▮</span> initializing…
          </li>
        ) : null}
        {steps.length === 0 && !running && status === "degraded" ? (
          <li className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden="true" className="text-accent">
              !
            </span>
            completed with partial results
          </li>
        ) : null}
        {steps.length === 0 && !running && status === "error" ? (
          <li className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden="true" className="text-destructive">
              ×
            </span>
            run failed before progress arrived
          </li>
        ) : null}
        {steps.map((step, i) => {
          const active = running && i === steps.length - 1;
          const marker = markerFor(active, i === steps.length - 1, running, status);
          return (
            <li key={`${step}-${i}`} className="flex items-start gap-2">
              <span aria-hidden="true" className={cn("select-none", marker.className)}>
                {marker.glyph}
              </span>
              <span className={cn("text-muted-foreground", active && "text-foreground")}>
                <span className="text-muted-foreground/60">{String(i + 1).padStart(2, "0")} </span>
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
