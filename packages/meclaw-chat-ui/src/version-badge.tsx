import { cn } from "./cn";

export function VersionBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none font-mono text-xs text-muted-foreground/70",
        className,
      )}
      role="note"
      aria-label={`Release ${label}`}
    >
      {label}
    </span>
  );
}
