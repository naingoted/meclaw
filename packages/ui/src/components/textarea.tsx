import * as React from "react";
import { cn } from "../utils";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive", className)} {...props} />,
);
Textarea.displayName = "Textarea";
