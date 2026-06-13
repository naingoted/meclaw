"use client";

import { useChat } from "@ai-sdk/react";
import type { PublicCopy } from "@meclaw/core/settings";
import { DEFAULT_PUBLIC_COPY } from "@meclaw/core/settings";
import { useTheme } from "@meclaw/ui";
import {
  appendStep,
  ChatConversation,
  type ChatUiMessage,
  HistoryDrawer,
  parseMessageCreatedAt,
  shouldRenderMessage,
  shouldShowThinking,
} from "@naingoted/meclaw-chat-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSession } from "@/lib/chat/sessions";
import {
  clearResumeEntry,
  getSession,
  listSessions,
  MAIN_RESUME_KEY,
  migrateEmbedLegacy,
  migrateLegacyEntry,
  readResumeEntry,
  removeSession,
  setSessionTitle,
  setSessionToken,
  upsertSession,
  writeResumeEntry,
} from "@/lib/chat/sessions";
import { ChatToolbar } from "./chat-toolbar";
import { ConfigRefreshPoller } from "./config-refresh-poller";

// Re-export package utilities so existing tests keep a stable import surface.
export {
  appendStep,
  groundingLabel,
  hasRenderedText,
  LiveTrace,
  shouldRenderMessage,
  shouldShowThinking,
} from "@naingoted/meclaw-chat-ui";

// Re-export the embed single-entry helpers + sentinel so existing importers
// (chat.test.tsx, chat-embed.test.tsx) keep a stable surface. Implementations
// now live in lib/chat/sessions.ts.
export { clearResumeEntry, MAIN_RESUME_KEY, readResumeEntry, writeResumeEntry };

type SourceMetadata = {
  title?: unknown;
  slug?: unknown;
  path?: unknown;
  source?: unknown;
  score?: unknown;
};

type ChatMessageLike = {
  role?: string;
  metadata?: unknown;
};

type RenderedSource = {
  title: string;
  location: string;
  score?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readScore(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed.toFixed(2);
    }
  }

  return undefined;
}

/**
 * Persist a data-resume-token SSE event. Embed mode writes the single entry
 * keyed on embedToken; normal mode stores the token in the session index.
 * Exported for direct unit testing.
 */
export function handleResumeTokenEvent(
  part: unknown,
  mode: "normal" | "embed",
  embedToken: string | undefined,
): void {
  if (!isRecord(part) || part.type !== "data-resume-token") return;
  const data = part.data;
  if (!isRecord(data)) return;
  const token = readString(data.token);
  const convId = readString(data.conversationId);
  if (!token || !convId) return;
  if (mode === "embed") {
    // Write to the scoped session index — loadConversation reads from here.
    if (embedToken)
      setSessionToken({ scope: embedToken, conversationId: convId, resumeToken: token });
  } else {
    setSessionToken({ conversationId: convId, resumeToken: token });
  }
}

// fallow-ignore-next-line complexity
function parseSource(source: unknown): RenderedSource | null {
  if (!isRecord(source)) return null;
  const s = source as SourceMetadata;
  const title =
    readString(s.title) ?? readString(s.source) ?? readString(s.path) ?? readString(s.slug);
  const location = readString(s.path) ?? readString(s.slug) ?? readString(s.source);
  const score = readScore(s.score);
  if (!title && !location) return null;
  return {
    title: title ?? location ?? "Source",
    location: location ?? "Unknown source",
    ...(score ? { score } : {}),
  };
}

function extractSources(message: ChatMessageLike): RenderedSource[] {
  if (process.env.NODE_ENV === "production" || message.role !== "assistant") {
    return [];
  }

  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const rawSources = metadata ? metadata.sources : undefined;

  if (!Array.isArray(rawSources)) {
    return [];
  }

  return rawSources.flatMap((source): RenderedSource[] => {
    const parsed = parseSource(source);
    return parsed ? [parsed] : [];
  });
}

function extractRoute(message: ChatMessageLike): string | undefined {
  if (process.env.NODE_ENV === "production" || message.role !== "assistant") {
    return undefined;
  }
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return metadata ? (readString(metadata.route) ?? readString(metadata.intent)) : undefined;
}

export function extractCorpusVersion(message: ChatMessageLike): number | undefined {
  if (message.role !== "assistant") return undefined;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const v = metadata ? metadata.corpus_version : undefined;
  return typeof v === "number" ? v : undefined;
}

export function extractSteps(message: ChatMessageLike): string[] {
  if (message.role !== "assistant") return [];
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const raw = metadata ? metadata.steps : undefined;
  if (!Array.isArray(raw)) return [];
  const steps = raw.map((s) => readString(s)).filter((s): s is string => Boolean(s));
  return steps.length === raw.length ? steps : [];
}

type MessageWithParts = {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
};

type RenderableMessage = ChatMessageLike & {
  id: string;
  parts: Array<{ type?: string; text?: string }>;
};

function toChatUiMessage(
  message: RenderableMessage,
  timestamp: number | undefined,
  text: string,
): ChatUiMessage {
  const sources = extractSources(message);
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    text,
    timestamp,
    sources: sources.map((s) => ({ title: s.title, location: s.location, score: s.score })),
    route: extractRoute(message),
    steps: extractSteps(message),
    corpusVersion: extractCorpusVersion(message),
  };
}

export function Chat({
  greeting,
  suggestions,
  copy = DEFAULT_PUBLIC_COPY,
  initialConfigVersion,
  mode = "normal",
  embedToken,
  parentOrigin,
  onClose,
  initialTheme,
}: {
  greeting: string;
  suggestions: string[];
  copy?: PublicCopy;
  initialConfigVersion: string;
  mode?: "normal" | "embed";
  embedToken?: string;
  /** Parent embedding site's origin (e.g. "https://acme.com"). Required in embed mode. */
  parentOrigin?: string;
  /** Called when the user closes the widget (embed mode only). */
  onClose?: () => void;
  /** Initial theme from the parent page ("dark" | "light"). Drives the widget's ThemeProvider. */
  initialTheme?: "dark" | "light";
}) {
  const shellCopy = copy ?? DEFAULT_PUBLIC_COPY;
  // `liveSteps` accumulates the backend's transient `data-status` labels into an
  // ordered checklist ("Routing…" → "Searching…" → "Writing…") shown live during
  // the pre-answer gap. The same labels persist per-message via metadata.steps.
  const scope = mode === "embed" ? embedToken : undefined;
  const [liveSteps, setLiveSteps] = useState<string[]>([]);

  // ----- Theme sync (embed mode) -----
  // Apply the parent page's theme to the widget's ThemeProvider, then keep it
  // in sync via postMessage. embed.js relays the parent's `meclaw:theme`
  // messages into the iframe; we listen here and call setTheme().
  const { setTheme } = useTheme();
  useEffect(() => {
    if (mode !== "embed") return;
    if (initialTheme) setTheme(initialTheme);

    const handler = (e: MessageEvent) => {
      if (e.origin !== parentOrigin && e.source !== window.parent) return;
      const data = e.data;
      if (!data || data.type !== "meclaw:theme") return;
      if (data.theme === "dark" || data.theme === "light") {
        setTheme(data.theme);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [mode, initialTheme, parentOrigin, setTheme]);

  // Resume from a stored entry when one exists: embed mode keys on embedToken,
  // normal mode uses the session index. Otherwise start a fresh conversation.
  const [conversationId, setConversationId] = useState(() => {
    if (mode === "embed") {
      if (embedToken) migrateEmbedLegacy(embedToken);
      const latest = embedToken ? listSessions({ scope: embedToken })[0] : null;
      return latest?.conversationId ?? crypto.randomUUID();
    }
    // Normal mode: fold any legacy single entry into the index, then resume the
    // most-recently-updated session if one exists.
    migrateLegacyEntry();
    const latest = listSessions({ scope })[0];
    return latest?.conversationId ?? crypto.randomUUID();
  });
  const historyFetchedRef = useRef(false);
  const { messages, sendMessage, status, setMessages } = useChat({
    onData: (part) => {
      if (part.type === "data-status" && isRecord(part.data)) {
        const label = readString(part.data.label);
        if (label) setLiveSteps((prev) => appendStep(prev, label));
      }
      // Handle resume token events from embed mode (extracted to reduce complexity)
      handleResumeTokenEvent(part, mode, embedToken);
    },
  });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchingRef = useRef(false);
  // Stable first-seen time per live message id (UIMessages carry no timestamp).
  // Stamped in an effect (not during render — Date.now/ref access would be
  // impure); cleared on New chat / switch. Bounded per conversation.
  const [firstSeen, setFirstSeen] = useState<Map<string, number>>(() => new Map());
  const [historyOpen, setHistoryOpen] = useState(false);
  // Snapshot of the session index for the drawer, seeded when it opens and
  // refreshed after a delete — avoids re-reading localStorage on every render.
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const openHistory = useCallback(() => {
    setSessions(listSessions({ scope }));
    setHistoryOpen(true);
  }, [scope]);

  const startNewChat = useCallback(() => {
    const id = crypto.randomUUID();
    setConversationId(id);
    setMessages([]);
    setLiveSteps([]);
    setFirstSeen(new Map());
    setHistoryOpen(false);
  }, [setMessages]);

  // A message's timestamp: its persisted `createdAt`, else the wall-clock time
  // it was first seen this session (read from state — stamped by the effect).
  function messageTimestamp(message: { id: string; metadata?: unknown }): number | undefined {
    return parseMessageCreatedAt(message.metadata) ?? firstSeen.get(message.id);
  }

  function messageText(message: { parts?: Array<{ type?: string; text?: string }> }): string {
    return (message.parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("");
  }

  // Auto-scroll to the latest message as content streams in.
  // Suppressed when the input is focused (keyboard open) — the input
  // scroll-into-view handler owns the scroll position in that case.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is a re-run trigger, not read in the body
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mobile keyboard handling: scroll input into view when viewport shrinks
  // (keyboard opening). Only fires when input is focused and user isn't
  // actively touching the message area (to avoid fighting manual scroll).
  useEffect(() => {
    if (!inputRef.current || !window.visualViewport) return;

    const scrollInputIntoView = () => {
      if (document.activeElement === inputRef.current && !touchingRef.current) {
        inputRef.current?.scrollIntoView({ block: "nearest" });
      }
    };

    window.visualViewport.addEventListener("resize", scrollInputIntoView);
    return () => {
      window.visualViewport?.removeEventListener("resize", scrollInputIntoView);
    };
  }, []);

  // Stamp a first-seen time for any new message lacking a persisted createdAt.
  // Must run in an effect: the wall-clock is impure (no Date.now in render) and
  // the value drives render output (so it lives in state, not a ref). The
  // updater is a no-op once every visible id is stamped, so it can't loop.
  useEffect(() => {
    const now = Date.now();
    // impure clock value; setState in effect is intentional (see above)
    setFirstSeen((prev) => {
      let next = prev;
      for (const m of messages) {
        if (parseMessageCreatedAt(m.metadata) !== undefined || prev.has(m.id)) continue;
        if (next === prev) next = new Map(prev);
        next.set(m.id, now);
      }
      return next;
    });
  }, [messages]);

  // Fetch a conversation's history and hydrate the message list. Used on mount
  // (resume) and by the history drawer (Task 7). Resolves the resume token from
  // the embed single entry (embed) or the session index (normal).
  const loadConversation = useCallback(
    (id: string) => {
      const resume = getSession({ scope, conversationId: id });
      if (!resume) {
        setMessages([]);
        return;
      }
      const params = new URLSearchParams({ conversationId: id, resumeToken: resume.resumeToken });
      if (mode === "embed" && embedToken) {
        params.set("embedToken", embedToken);
        if (parentOrigin) params.set("parentOrigin", parentOrigin);
      }
      fetch(`/api/chat/history?${params.toString()}`)
        .then((res) => {
          if (!res.ok) {
            // Stale/invalid token — forget this conversation, start fresh.
            // Note: in embed mode this targets the namespaced index; the legacy
            // resume key cleanup is owned by migrateEmbedLegacy (Task 6).
            removeSession({ scope, conversationId: id });
            return null;
          }
          return res.json() as Promise<{
            conversationId: string;
            messages: Array<{
              id: string;
              role: "user" | "assistant";
              content: string;
              createdAt?: string;
            }>;
          }>;
        })
        .then((data) => {
          if (!data) return;
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: [{ type: "text" as const, text: m.content }],
              ...(m.createdAt ? { metadata: { createdAt: m.createdAt } } : {}),
            })),
          );
        })
        .catch(() => {
          // See note above: targets namespaced index; legacy key cleanup deferred to Task 6.
          removeSession({ scope, conversationId: id });
        });
    },
    [mode, embedToken, parentOrigin, scope, setMessages],
  );

  // Switch to a stored conversation from the history drawer: point at its id,
  // clear transient UI, then fetch + hydrate its transcript.
  const pickConversation = useCallback(
    (id: string) => {
      setConversationId(id);
      setLiveSteps([]);
      setFirstSeen(new Map());
      setHistoryOpen(false);
      loadConversation(id);
    },
    [loadConversation],
  );

  // Remove a conversation from the local index. If it's the active one, fall
  // back to a fresh chat (DB rows are untouched — local index only).
  const deleteConversation = useCallback(
    (id: string) => {
      removeSession({ scope, conversationId: id });
      // Deleting the active chat resets to a fresh one (which also closes the
      // drawer); deleting another just refreshes the still-open list.
      if (id === conversationId) startNewChat();
      else setSessions(listSessions({ scope }));
    },
    [conversationId, scope, startNewChat],
  );

  // Resume the active conversation once on mount. Mount-only: conversationId/
  // loadConversation are stable for the initial id.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only resume; deps intentionally empty
  useEffect(() => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    loadConversation(conversationId);
  }, []);

  const isStreaming = status === "submitted" || status === "streaming";
  const showThinking = shouldShowThinking(status, messages as MessageWithParts[]);

  function handleClose() {
    if (mode === "embed") {
      window.parent.postMessage({ type: "meclaw:close", version: 1 }, parentOrigin ?? "*");
    }
    onClose?.();
  }

  // Escape key closes the widget in embed mode. The parent page's Escape
  // listener in embed.js can't reach the iframe — external keyboard users
  // (iPad Magic Keyboard, Android BT keyboard) need an in-iframe handler.
  // Use refs for handleClose deps to avoid re-registering the listener on
  // every render (handleClose captures parentOrigin/onClose from props).
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (mode !== "embed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    registerUserTurn(text);
    setLiveSteps([]); // reset stale status from a prior turn
    sendMessage(
      { text },
      {
        body: buildRequestBody(),
      },
    );
    setInput("");
  }

  function handleChipClick(chipText: string) {
    registerUserTurn(chipText);
    setLiveSteps([]);
    sendMessage(
      { text: chipText },
      {
        body: buildRequestBody(),
      },
    );
  }

  /**
   * Build the request body for a chat POST. Embed mode sends the embedToken + parentOrigin.
   * Normal mode sends the stored resume token so the server can verify prior access
   * before minting a new resume token for the continued conversation.
   */
  function buildRequestBody(): Record<string, string | undefined> {
    const body: Record<string, string | undefined> = { conversationId };
    if (mode === "embed" && embedToken) {
      body.embedToken = embedToken;
      body.parentOrigin = parentOrigin;
    } else {
      // First-party: include the stored resume token for this conversation (if any)
      // so the server can verify prior access before minting a new one.
      const session = getSession({ scope, conversationId });
      if (session?.resumeToken) body.resumeToken = session.resumeToken;
    }
    return body;
  }

  // On the first user turn, register the session and set its title.
  function registerUserTurn(text: string) {
    upsertSession({ scope, conversationId });
    setSessionTitle({ scope, conversationId, title: text });
  }

  const uiMessages: ChatUiMessage[] = messages
    .filter((message) => shouldRenderMessage(message as MessageWithParts))
    .map((message) => {
      const text = messageText(message);
      return toChatUiMessage(message as RenderableMessage, messageTimestamp(message), text);
    });

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <ConfigRefreshPoller initialConfigVersion={initialConfigVersion} status={status} />
      <ChatToolbar
        mode={mode}
        onNewChat={startNewChat}
        onOpenHistory={openHistory}
        onClose={handleClose}
      />
      <ChatConversation
        className="flex-1"
        messages={uiMessages}
        greeting={greeting}
        suggestions={suggestions}
        copy={shellCopy}
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onSuggestion={handleChipClick}
        isStreaming={isStreaming}
        showThinking={showThinking}
        liveSteps={liveSteps}
        showDevPanels={process.env.NODE_ENV !== "production"}
        transcriptEndRef={endRef}
        inputRef={inputRef}
        onTranscriptTouchStart={() => {
          touchingRef.current = true;
        }}
        onTranscriptTouchEnd={() => {
          touchingRef.current = false;
        }}
      />

      <HistoryDrawer
        open={historyOpen}
        sessions={sessions}
        activeConversationId={conversationId}
        onSelect={pickConversation}
        onDelete={deleteConversation}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
