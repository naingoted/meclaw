import * as React from "react";
import { cn } from "../utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive", className)} {...props} />,
);
Input.displayName = "Input";
