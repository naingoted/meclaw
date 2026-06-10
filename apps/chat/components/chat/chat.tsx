"use client";

import { useChat } from "@ai-sdk/react";
import { Button, cn } from "@meclaw/ui";
import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ConfigRefreshPoller } from "./config-refresh-poller";

// --- Embed resume helpers (localStorage) ---
type ResumeEntry = { conversationId: string; resumeToken: string };

const RESUME_KEY_PREFIX = "meclaw:resume:";

// First-party (main chat) sessions store their resume entry under a fixed key
// and sign/verify against the matching "__main__" sentinel embedClientId.
export const MAIN_RESUME_KEY = "__main__";

/**
 * Read a resume entry from localStorage for the given embedToken.
 * Returns null if no entry exists, localStorage is unavailable, or parsing fails.
 * Safe to call in SSR (returns null).
 */
export function readResumeEntry(embedToken: string): ResumeEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${RESUME_KEY_PREFIX}${embedToken}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "conversationId" in parsed &&
      "resumeToken" in parsed &&
      typeof (parsed as ResumeEntry).conversationId === "string" &&
      typeof (parsed as ResumeEntry).resumeToken === "string"
    ) {
      return parsed as ResumeEntry;
    }
    return null;
  } catch {
    // private browsing, quota exceeded, or malformed JSON
    return null;
  }
}

/**
 * Write a resume entry to localStorage for the given embedToken.
 * Safe to call in SSR (does nothing).
 */
export function writeResumeEntry(embedToken: string, entry: ResumeEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${RESUME_KEY_PREFIX}${embedToken}`, JSON.stringify(entry));
  } catch {
    // private browsing, quota exceeded — silently ignore
  }
}

/**
 * Clear a resume entry from localStorage for the given embedToken.
 * Safe to call in SSR (does nothing).
 */
export function clearResumeEntry(embedToken: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${RESUME_KEY_PREFIX}${embedToken}`);
  } catch {
    // private browsing, quota exceeded — silently ignore
  }
}

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
 * Persist a data-resume-token SSE event to localStorage. Stores under the
 * embedToken key in embed mode, or under MAIN_RESUME_KEY in normal mode.
 * Exported for direct unit testing.
 */
export function handleResumeTokenEvent(
  part: unknown,
  mode: "normal" | "embed",
  embedToken: string | undefined,
): void {
  const key = mode === "embed" ? embedToken : MAIN_RESUME_KEY;
  if (!key) return;
  if (!isRecord(part) || part.type !== "data-resume-token") return;
  const data = part.data;
  if (!isRecord(data)) return;
  const token = readString(data.token);
  const convId = readString(data.conversationId);
  if (token && convId) {
    writeResumeEntry(key, { conversationId: convId, resumeToken: token });
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
  // normal mode on MAIN_RESUME_KEY. Otherwise start a fresh conversation.
  const [conversationId] = useState(() => {
    const key = mode === "embed" ? embedToken : MAIN_RESUME_KEY;
    if (key) {
      const entry = readResumeEntry(key);
      if (entry) return entry.conversationId;
    }
    return crypto.randomUUID();
  });
  // Track whether we've attempted to fetch history in embed mode (to avoid re-fetching).
  // Using a ref (not state) so that setting it doesn't trigger a re-render which would
  // run the effect cleanup and cancel the in-flight fetch.
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

  // Auto-scroll to the latest message as content streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch history on mount when a resume entry exists. Embed mode keys on
  // embedToken (and forwards embedToken + parentOrigin); normal mode keys on
  // MAIN_RESUME_KEY (same-origin, no embed params).
  useEffect(() => {
    const key = mode === "embed" ? embedToken : MAIN_RESUME_KEY;
    if (!key || historyFetchedRef.current) return;
    const entry = readResumeEntry(key);
    if (!entry) return;

    historyFetchedRef.current = true;
    let cancelled = false;
    const params = new URLSearchParams({
      conversationId: entry.conversationId,
      resumeToken: entry.resumeToken,
    });
    if (mode === "embed" && embedToken) {
      params.set("embedToken", embedToken);
      if (parentOrigin) params.set("parentOrigin", parentOrigin);
    }
    const url = `/api/chat/history?${params.toString()}`;

    fetch(url)
      .then((res) => {
        if (cancelled) return null;
        if (!res.ok) {
          // Stale resume token (401), forbidden (403), or other error — clear entry and start fresh.
          clearResumeEntry(key);
          return null;
        }
        return res.json() as Promise<{
          conversationId: string;
          messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
        }>;
      })
      .then((data) => {
        if (cancelled || !data) return; // fetch failed or unmounted, already cleared entry
        // Convert history messages to UIMessage shape for useChat.
        const uiMessages = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text" as const, text: m.content }],
        }));
        setMessages(uiMessages);
      })
      .catch(() => {
        if (cancelled) return;
        // Network error or other failure — clear entry and start fresh.
        clearResumeEntry(key);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, embedToken, parentOrigin, setMessages]);

  const isStreaming = status === "submitted" || status === "streaming";
  const showThinking = shouldShowThinking(status, messages as MessageWithParts[]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
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
      // First-party: include the stored resume token (if any) so the server can
      // verify we have prior access to this conversation before minting a new one.
      // New conversations (no stored entry) omit the token — the server will
      // accept the conversationId as new and mint a fresh token.
      const entry = readResumeEntry(MAIN_RESUME_KEY);
      if (entry) {
        body.resumeToken = entry.resumeToken;
      }
    }
    return body;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <ConfigRefreshPoller initialConfigVersion={initialConfigVersion} status={status} />
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
        {messages.map((message) => {
          if (!shouldRenderMessage(message as MessageWithParts)) return null;
          const sources = extractSources(message);
          const route = extractRoute(message);
          const steps = extractSteps(message);
          // Hold persisted blocks until answer text begins, so they don't
          // overlap the live checklist (metadata lands before the first token).
          const answered = hasRenderedText(message as MessageWithParts);

          return (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role === "assistant" ? (
                <>
                  <div
                    data-testid="bot-avatar"
                    className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
                  >
                    <Bot className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
                      {message.parts.map((part, i) =>
                        part.type === "text" ? (
                          <div
                            key={`${message.id}-${i}`}
                            className="prose prose-sm max-w-none font-sans dark:prose-invert"
                          >
                            <ReactMarkdown>{part.text}</ReactMarkdown>
                          </div>
                        ) : null,
                      )}
                    </div>
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
              ) : (
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                    "bg-primary text-primary-foreground",
                  )}
                >
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <div
                        key={`${message.id}-${i}`}
                        className="prose prose-sm max-w-none dark:prose-invert"
                      >
                        <ReactMarkdown>{part.text}</ReactMarkdown>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
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
    </div>
  );
}
