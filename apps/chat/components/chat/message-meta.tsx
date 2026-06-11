"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { formatTime } from "@/lib/chat/time";

/**
 * Muted timestamp line + copy button shown under a message bubble. `timestamp`
 * is epoch ms; falls back to an em dash when absent (legacy row, clock skew).
 */
export function MessageMeta({ timestamp, text }: { timestamp?: number; text: string }) {
  const [copied, setCopied] = useState(false);
  const label = timestamp !== undefined ? formatTime(timestamp) : "—";
  const title = timestamp !== undefined ? new Date(timestamp).toLocaleString() : undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <span title={title} className="font-mono">
        {label}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy message"
        className="inline-flex items-center rounded-sm px-1 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
