"use client";

import { cn } from "@meclaw/ui";
import { Trash2, X } from "lucide-react";
import { useEffect } from "react";
import type { ChatSession } from "@/lib/chat/sessions";
import { formatDayLabel, formatTime } from "@/lib/chat/time";

/**
 * Side drawer listing past conversations (main chat only). Rows are rendered in
 * the order given (caller pre-sorts newest-first). Click a row to load it;
 * click the trash to remove it from the local index (DB rows untouched).
 */
export function HistoryDrawer({
  open,
  sessions,
  activeConversationId,
  onSelect,
  onDelete,
  onClose,
}: {
  open: boolean;
  sessions: ChatSession[];
  activeConversationId: string;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close history"
        className="flex-1 bg-black/50"
        onClick={onClose}
      />
      <aside className="flex w-80 max-w-[80vw] flex-col border-l border-border bg-background">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-sm font-bold text-foreground">
            <span className="text-primary">▮</span> History
          </span>
          <button
            type="button"
            aria-label="Close history"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {sessions.length === 0 ? (
          <p className="p-4 font-mono text-xs text-muted-foreground">No past conversations yet.</p>
        ) : (
          <ul className="flex-1 overflow-y-auto p-2">
            {sessions.map((s) => (
              <li key={s.conversationId} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.conversationId)}
                  className={cn(
                    "min-w-0 flex-1 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    s.conversationId === activeConversationId && "bg-muted",
                  )}
                >
                  <span className="block truncate text-sm text-foreground">
                    {s.title.trim() || "New conversation"}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {formatDayLabel(s.updatedAt)} · {formatTime(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => onDelete(s.conversationId)}
                  className="shrink-0 rounded-sm p-2 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
