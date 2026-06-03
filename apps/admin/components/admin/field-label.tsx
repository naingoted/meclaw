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
 *  Pass `error` to flag the control invalid (red ring via aria-invalid) and show
 *  the message below it. Stack multiple <Field>s inside `space-y-5`. */
export function Field({
  label,
  help,
  htmlFor,
  error,
  children,
}: {
  label: string;
  help: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  // Mark the single control invalid so the shared Input/Textarea turn red.
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ "aria-invalid"?: boolean }>, {
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} help={help} htmlFor={htmlFor} />
      {control}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
