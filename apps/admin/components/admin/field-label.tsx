"use client";
import { Label, Tooltip, TooltipTrigger, TooltipContent } from "@meclaw/ui";
import { Info } from "lucide-react";

/** A field label with an inline info icon that reveals a description on hover/focus. */
export function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Label>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label} help`}
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </div>
  );
}
