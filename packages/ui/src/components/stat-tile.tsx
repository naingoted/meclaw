import type * as React from "react";
import type { StatusTone } from "../status";
import { cn } from "../utils";

const VALUE_TONE: Record<StatusTone, string> = {
  neutral: "text-foreground",
  running: "text-primary",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-accent",
};

export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className={cn("text-2xl font-bold leading-none", VALUE_TONE[tone])}>{value}</div>
      <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
