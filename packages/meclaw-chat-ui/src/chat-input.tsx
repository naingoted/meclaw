"use client";

import type { FormEvent, RefObject } from "react";
import type { ChatUiCopy } from "./types";

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isStreaming,
  copy,
  inputRef,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isStreaming: boolean;
  copy: ChatUiCopy;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-4">
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={copy.messagePlaceholder}
        aria-label="Message"
        enterKeyHint="send"
        autoComplete="off"
        name="message"
        className="min-w-0 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={isStreaming || input.trim().length === 0}
        aria-busy={isStreaming}
        className="inline-flex items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copy.sendLabel ?? "Send"}
      </button>
    </form>
  );
}
