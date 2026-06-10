import type * as React from "react";
import { cn } from "../utils";
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: primitive Label; htmlFor/control supplied by the caller via props
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}
