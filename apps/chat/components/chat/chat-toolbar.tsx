"use client";

import { History, Plus } from "lucide-react";

const BTN =
  "inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Slim control row inside the chat panel. `New chat` shows on every surface;
 * `History` opens the drawer and is normal-mode only (the embed widget is too
 * cramped for a drawer).
 */
export function ChatToolbar({
  mode,
  onNewChat,
  onOpenHistory,
}: {
  mode: "normal" | "embed";
  onNewChat: () => void;
  onOpenHistory: () => void;
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
    </div>
  );
}
