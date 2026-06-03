"use client";
import { Label, Popover, PopoverTrigger, PopoverContent } from "@meclaw/ui";
import { Info } from "lucide-react";
import * as React from "react";

/** Label row with an inline info icon. Click the icon to toggle a help popover
 *  (also keyboard-accessible: focus + Enter/Space, Escape to close). */
export function FieldLabel({ label, help, htmlFor }: { label: string; help: string; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label} help`}
            className="inline-flex cursor-pointer items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent>{help}</PopoverContent>
      </Popover>
    </div>
  );
}

/** A single form field: label row + control, with standardized internal spacing.
 *  Stack multiple <Field>s inside a `space-y-5` container for consistent gaps. */
export function Field({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} help={help} htmlFor={htmlFor} />
      {children}
    </div>
  );
}
