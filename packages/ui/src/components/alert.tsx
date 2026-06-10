import type * as React from "react";
import { cn } from "../utils";

const variants = {
  default: "border-border bg-muted text-foreground",
  success: "border-success bg-success/10 text-foreground",
  destructive: "border-destructive bg-destructive/10 text-foreground",
  warning: "border-accent bg-accent/10 text-foreground",
} as const;

export function Alert({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("rounded-lg border p-4 text-sm", variants[variant], className)}>
      {children}
    </div>
  );
}
