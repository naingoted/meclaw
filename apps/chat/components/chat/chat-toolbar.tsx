"use client";

import { History, Plus, X } from "lucide-react";

const BTN =
  "inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Slim control row inside the chat panel. `New chat` shows on every surface;
 * `History` opens the drawer and is normal-mode only (the embed widget is too
 * cramped for a drawer). Close button appears in embed mode only — on mobile
 * the floating bubble is hidden, so the toolbar is the only way to dismiss.
 */
export function ChatToolbar({
  mode,
  onNewChat,
  onOpenHistory,
  onClose,
}: {
  mode: "normal" | "embed";
  onNewChat: () => void;
  onOpenHistory: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <button type="button" onClick={onNewChat} className={BTN}>
        <Plus className="h-3.5 w-3.5" />
        New chat
      </button>
      {mode === "normal" ? (
        <button type="button" onClick={onOpenHistory} className={BTN}>
          <History className="h-3.5 w-3.5" />
          History
        </button>
      ) : null}
      {mode === "embed" ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="ml-auto inline-flex items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
