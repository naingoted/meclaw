import { type StatusTone, statusTone } from "../status";
import { cn } from "../utils";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  running: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-accent/15 text-accent",
};
const DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  running: "bg-primary animate-pulse",
  success: "bg-success",
  danger: "bg-destructive",
  warning: "bg-accent",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
        TONE[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {status}
    </span>
  );
}
