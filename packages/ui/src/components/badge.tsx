import * as React from "react";
import { cn } from "../utils";

const tones: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};
export function Badge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone && tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
