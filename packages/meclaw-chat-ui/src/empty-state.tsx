"use client";

import type { ChatUiCopy } from "./types";

export function EmptyState({
  greeting,
  suggestions,
  copy,
  onSuggestion,
}: {
  greeting: string;
  suggestions: string[];
  copy: ChatUiCopy;
  onSuggestion: (text: string) => void;
}) {
  return (
    <div className="mt-10 space-y-6">
      <div className="space-y-1 font-sans">
        <p className="text-sm font-medium">{greeting}</p>
        <p className="text-sm text-muted-foreground">{copy.emptyStateIntro}</p>
      </div>
      <SuggestionChips
        suggestions={suggestions}
        label={copy.suggestionsLabel}
        onSuggestion={onSuggestion}
      />
    </div>
  );
}

export function SuggestionChips({
  suggestions,
  label,
  onSuggestion,
}: {
  suggestions: string[];
  label: string;
  onSuggestion: (text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-2">
        {suggestions.map((chip) => (
          <button
            type="button"
            key={chip}
            onClick={() => onSuggestion(chip)}
            className="cursor-pointer rounded-sm border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
