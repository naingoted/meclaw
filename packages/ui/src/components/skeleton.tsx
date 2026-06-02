import * as React from "react";
import { cn } from "../utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("shimmer rounded-sm bg-muted", className)}
    />
  );
}
