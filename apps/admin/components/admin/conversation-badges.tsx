import { cn } from "@meclaw/ui";
import type { Outcome } from "@/lib/admin/conversations";

const OUTCOME_TONE: Record<Outcome, string> = {
  answered: "bg-success/15 text-success",
  gap: "bg-destructive/15 text-destructive",
  abandoned: "bg-muted text-muted-foreground",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
        OUTCOME_TONE[outcome],
      )}
    >
      {outcome}
    </span>
  );
}

export function TurnCountBadge({ count }: { count: number }) {
  const long = count > 8; // potential-confusion signal
  return (
    <span className={cn("font-mono text-xs", long ? "text-accent" : "text-muted-foreground")}>
      {count} turns
    </span>
  );
}
