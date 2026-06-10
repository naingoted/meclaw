"use client";

import { useChat } from "@ai-sdk/react";
import { Button, cn } from "@meclaw/ui";
import { Bot } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatSession } from "@/lib/chat/sessions";
import {
  clearResumeEntry,
  getSession,
  listSessions,
  MAIN_RESUME_KEY,
  migrateLegacyEntry,
  readResumeEntry,
  removeSession,
  setSessionTitle,
  setSessionToken,
  upsertSession,
  writeResumeEntry,
} from "@/lib/chat/sessions";
import { formatDayLabel, isSameDay } from "@/lib/chat/time";
import { ChatToolbar } from "./chat-toolbar";
import { ConfigRefreshPoller } from "./config-refresh-poller";
import { HistoryDrawer } from "./history-drawer";
import { MessageMeta } from "./message-meta";

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
 * Append a live step label, skipping a consecutive duplicate so a repeated
 * data-status emit can't double a checklist row.
 */
export function appendStep(steps: string[], label: string): string[] {
  if (steps.length > 0 && steps[steps.length - 1] === label) return steps;
  return [...steps, label];
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
    if (embedToken) writeResumeEntry(embedToken, { conversationId: convId, resumeToken: token });
  } else {
    setSessionToken(convId, token);
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

const KNOWLEDGE_ROUTES = new Set(["tech", "project", "general"]);

export function groundingLabel(route: string | undefined, sourceCount: number): string {
  if (route && KNOWLEDGE_ROUTES.has(route)) {
    return sourceCount > 0 ? `grounded on ${sourceCount} sources` : "no matching corpus content";
  }
  return `answered without corpus (intent: ${route ?? "unknown"})`;
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

/** Parse an ISO `metadata.createdAt` to epoch ms, or undefined when absent/bad. */
function readCreatedAt(metadata: unknown): number | undefined {
  const meta = isRecord(metadata) ? metadata : null;
  const created =
    meta && typeof meta.createdAt === "string" ? Date.parse(meta.createdAt) : Number.NaN;
  return Number.isFinite(created) ? created : undefined;
}

type MessageWithParts = {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
};

/**
 * Whether a message has begun streaming non-empty text. Metadata (sources,
 * route, steps) arrives at `sse_start` — before the first token — so the
 * persisted "How I answered" trace and dev Sources panel gate on this to avoid
 * coexisting with the live checklist during the pre-token window. Text appears
 * exactly as the live checklist disappears, so the handoff is clean.
 */
export function hasRenderedText(message: MessageWithParts): boolean {
  return (
    Array.isArray(message.parts) &&
    message.parts.some((p) => p.type === "text" && (p.text?.length ?? 0) > 0)
  );
}

/**
 * Whether a message should render in the transcript. Suppresses an assistant
 * message that has not produced text yet — during that pre-token window
 * `LiveTrace` is the single visible bot, so rendering the empty bubble too would
 * show two bot avatars.
 */
export function shouldRenderMessage(message: MessageWithParts): boolean {
  return !(message.role === "assistant" && !hasRenderedText(message));
}

/**
 * Whether to show the "thinking" indicator: true from the moment a question is
 * sent until the first assistant token arrives. Once the assistant message has
 * text, the streamed answer replaces the indicator.
 */
export function shouldShowThinking(status: string, messages: MessageWithParts[]): boolean {
  if (status === "submitted") return true;
  if (status !== "streaming") return false;
  const last = messages[messages.length - 1];
  const hasAssistantText =
    last?.role === "assistant" &&
    Array.isArray(last.parts) &&
    last.parts.some((p) => p.type === "text" && (p.text?.length ?? 0) > 0);
  return !hasAssistantText;
}

function StepDots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

/**
 * Live growing checklist of the agent's pipeline steps. Completed steps show a
 * check; the last (active) step shows the animated dots. Falls back to a single
 * "Thinking…" line before any step label has arrived.
 */
export function LiveTrace({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <div
        data-testid="bot-avatar"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
      >
        <Bot className="h-5 w-5 text-foreground" />
      </div>
      <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
        {steps.length === 0 ? (
          <div className="flex items-center gap-2">
            <StepDots />
            <span>Thinking…</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {steps.map((step, i) => {
              const active = i === steps.length - 1;
              return (
                <li key={`${step}-${i}`} data-active={active} className="flex items-center gap-2">
                  {active ? (
                    <StepDots />
                  ) : (
                    <span aria-hidden="true" className="text-foreground">
                      ✓
                    </span>
                  )}
                  <span className={active ? "" : "text-foreground"}>{step}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SourcesPanel({
  sources,
  route,
  label,
  corpusVersion,
}: {
  sources: RenderedSource[];
  route?: string;
  label?: string;
  corpusVersion?: number;
}) {
  return (
    <div className="w-full max-w-[85%] rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      {label ? (
        <p className="font-mono text-xs text-muted-foreground">
          {label}
          {typeof corpusVersion === "number" ? ` · corpus v${corpusVersion}` : ""}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">Sources used</p>
        {route ? (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
            Routed: {route}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-2">
        {sources.map((source, index) => (
          <li key={`${source.location}-${index}`} className="space-y-0.5">
            <p className="font-medium text-foreground">{source.title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
              <span className="break-words">{source.location}</span>
              {source.score && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                  Score {source.score}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThinkingTrace({ steps }: { steps: string[] }) {
  return (
    <details className="w-full max-w-[85%] rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">How I answered</summary>
      <ol className="mt-2 space-y-1">
        {steps.map((step, i) => (
          <li key={`${step}-${i}`} className="flex items-center gap-2">
            <span aria-hidden="true">✓</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

type RenderableMessage = ChatMessageLike & {
  id: string;
  parts: Array<{ type?: string; text?: string }>;
};

/**
 * One assistant turn: avatar + markdown bubble, then (once answered) the
 * timestamp/copy line, the dev Sources panel, and the persisted "How I answered"
 * trace. Extracted from the transcript map to keep that callback simple.
 */
function AssistantTurn({
  message,
  ts,
  text,
  answered,
}: {
  message: RenderableMessage;
  ts: number | undefined;
  text: string;
  answered: boolean;
}) {
  const sources = extractSources(message);
  const route = extractRoute(message);
  const steps = extractSteps(message);
  return (
    <>
      <div
        data-testid="bot-avatar"
        className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
      >
        <Bot className="h-5 w-5 text-foreground" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
          {message.parts.map((part, j) =>
            part.type === "text" ? (
              <div
                key={`${message.id}-${j}`}
                className="prose prose-sm max-w-none font-sans dark:prose-invert"
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            ) : null,
          )}
        </div>
        {answered ? <MessageMeta timestamp={ts} text={text} /> : null}
        {answered && (sources.length > 0 || route) ? (
          <SourcesPanel
            sources={sources}
            route={route}
            label={groundingLabel(route, sources.length)}
            corpusVersion={extractCorpusVersion(message)}
          />
        ) : null}
        {answered && steps.length > 0 ? <ThinkingTrace steps={steps} /> : null}
      </div>
    </>
  );
}

/** One user turn: right-aligned markdown bubble + timestamp/copy line. */
function UserTurn({
  message,
  ts,
  text,
}: {
  message: RenderableMessage;
  ts: number | undefined;
  text: string;
}) {
  return (
    <div className="flex flex-col items-end">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
          "bg-primary text-primary-foreground",
        )}
      >
        {message.parts.map((part, j) =>
          part.type === "text" ? (
            <div key={`${message.id}-${j}`} className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{part.text}</ReactMarkdown>
            </div>
          ) : null,
        )}
      </div>
      <MessageMeta timestamp={ts} text={text} />
    </div>
  );
}

export function Chat({
  greeting,
  suggestions,
  initialConfigVersion,
  mode = "normal",
  embedToken,
  parentOrigin,
}: {
  greeting: string;
  suggestions: string[];
  initialConfigVersion: string;
  mode?: "normal" | "embed";
  embedToken?: string;
  /** Parent embedding site's origin (e.g. "https://acme.com"). Required in embed mode. */
  parentOrigin?: string;
}) {
  // `liveSteps` accumulates the backend's transient `data-status` labels into an
  // ordered checklist ("Routing…" → "Searching…" → "Writing…") shown live during
  // the pre-answer gap. The same labels persist per-message via metadata.steps.
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  // Resume from a stored entry when one exists: embed mode keys on embedToken,
  // normal mode uses the session index. Otherwise start a fresh conversation.
  const [conversationId, setConversationId] = useState(() => {
    if (mode === "embed") {
      const entry = embedToken ? readResumeEntry(embedToken) : null;
      return entry?.conversationId ?? crypto.randomUUID();
    }
    // Normal mode: fold any legacy single entry into the index, then resume the
    // most-recently-updated session if one exists.
    migrateLegacyEntry();
    const latest = listSessions()[0];
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
  // Stable first-seen time per live message id (UIMessages carry no timestamp).
  // Stamped in an effect (not during render — Date.now/ref access would be
  // impure); cleared on New chat / switch. Bounded per conversation.
  const [firstSeen, setFirstSeen] = useState<Map<string, number>>(() => new Map());
  const [historyOpen, setHistoryOpen] = useState(false);
  // Snapshot of the session index for the drawer, seeded when it opens and
  // refreshed after a delete — avoids re-reading localStorage on every render.
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const openHistory = useCallback(() => {
    setSessions(listSessions());
    setHistoryOpen(true);
  }, []);

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
    return readCreatedAt(message.metadata) ?? firstSeen.get(message.id);
  }

  function messageText(message: { parts?: Array<{ type?: string; text?: string }> }): string {
    return (message.parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("");
  }

  // Auto-scroll to the latest message as content streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stamp a first-seen time for any new message lacking a persisted createdAt.
  // Must run in an effect: the wall-clock is impure (no Date.now in render) and
  // the value drives render output (so it lives in state, not a ref). The
  // updater is a no-op once every visible id is stamped, so it can't loop.
  useEffect(() => {
    const now = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- impure clock value; see above
    setFirstSeen((prev) => {
      let next = prev;
      for (const m of messages) {
        if (readCreatedAt(m.metadata) !== undefined || prev.has(m.id)) continue;
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
      const resume =
        mode === "embed" ? (embedToken ? readResumeEntry(embedToken) : null) : getSession(id);
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
            if (mode === "embed" && embedToken) clearResumeEntry(embedToken);
            else removeSession(id);
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
          if (mode === "embed" && embedToken) clearResumeEntry(embedToken);
          else removeSession(id);
        });
    },
    [mode, embedToken, parentOrigin, setMessages],
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
      removeSession(id);
      // Deleting the active chat resets to a fresh one (which also closes the
      // drawer); deleting another just refreshes the still-open list.
      if (id === conversationId) startNewChat();
      else setSessions(listSessions());
    },
    [conversationId, startNewChat],
  );

  // Resume the active conversation once on mount.
  useEffect(() => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    loadConversation(conversationId);
    // Mount-only: conversationId/loadConversation are stable for the initial id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStreaming = status === "submitted" || status === "streaming";
  const showThinking = shouldShowThinking(status, messages as MessageWithParts[]);

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
      const session = getSession(conversationId);
      if (session?.resumeToken) body.resumeToken = session.resumeToken;
    }
    return body;
  }

  // On the first user turn (normal mode), register the session and set its title.
  function registerUserTurn(text: string) {
    if (mode === "embed") return;
    upsertSession({ conversationId });
    setSessionTitle(conversationId, text);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <ConfigRefreshPoller initialConfigVersion={initialConfigVersion} status={status} />
      <ChatToolbar mode={mode} onNewChat={startNewChat} onOpenHistory={openHistory} />
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-10 space-y-6">
            {/* Greeting from meclaw */}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-5 w-5 text-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{greeting}</p>
                <p className="text-sm text-muted-foreground">
                  Ask me anything about his work, skills, or projects.
                </p>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    className="cursor-pointer rounded-sm border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages
          .filter((message) => shouldRenderMessage(message as MessageWithParts))
          .map((message, i, visible) => {
            // Hold persisted blocks until answer text begins, so they don't
            // overlap the live checklist (metadata lands before the first token).
            const answered = hasRenderedText(message as MessageWithParts);
            const ts = messageTimestamp(message);
            const prevTs = i > 0 ? messageTimestamp(visible[i - 1]) : undefined;
            const showDay = ts !== undefined && (prevTs === undefined || !isSameDay(prevTs, ts));
            const text = messageText(message);

            return (
              <div key={message.id}>
                {showDay ? (
                  <div className="my-3 text-center font-mono text-[11px] text-muted-foreground">
                    {formatDayLabel(ts)}
                  </div>
                ) : null}
                <div
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.role === "assistant" ? (
                    <AssistantTurn
                      message={message as RenderableMessage}
                      ts={ts}
                      text={text}
                      answered={answered}
                    />
                  ) : (
                    <UserTurn message={message as RenderableMessage} ts={ts} text={text} />
                  )}
                </div>
              </div>
            );
          })}
        {showThinking && <LiveTrace steps={liveSteps} />}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something…"
          className="flex-1 rounded-sm border border-input bg-card px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          loading={isStreaming}
          disabled={isStreaming || input.trim().length === 0}
        >
          Send
        </Button>
      </form>

      {mode === "normal" ? (
        <HistoryDrawer
          open={historyOpen}
          sessions={sessions}
          activeConversationId={conversationId}
          onSelect={pickConversation}
          onDelete={deleteConversation}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
