"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SUGGESTION_CHIPS = [
  "What's Thet's tech stack?",
  "Walk me through a recent project",
  "How do I get in touch?",
];

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
    if (!isRecord(source)) {
      return [];
    }

    const typedSource = source as SourceMetadata;
    const title =
      readString(typedSource.title) ??
      readString(typedSource.source) ??
      readString(typedSource.path) ??
      readString(typedSource.slug);
    const location =
      readString(typedSource.path) ?? readString(typedSource.slug) ?? readString(typedSource.source);
    const score = readScore(typedSource.score);

    if (!title && !location) {
      return [];
    }

    return [
      {
        title: title ?? location ?? "Source",
        location: location ?? "Unknown source",
        ...(score ? { score } : {}),
      },
    ];
  });
}

function extractRoute(message: ChatMessageLike): string | undefined {
  if (process.env.NODE_ENV === "production" || message.role !== "assistant") {
    return undefined;
  }
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return metadata ? readString(metadata.route) ?? readString(metadata.intent) : undefined;
}

function SourcesPanel({ sources, route }: { sources: RenderedSource[]; route?: string }) {
  return (
    <div className="w-full max-w-[85%] rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
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

export function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message as content streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isStreaming = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  }

  function handleChipClick(chipText: string) {
    sendMessage({ text: chipText });
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-10 space-y-6">
            {/* Greeting from echo */}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-5 w-5 text-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Hi! I&apos;m echo, Thet&apos;s AI twin.</p>
                <p className="text-sm text-muted-foreground">
                  Ask me anything about his work, skills, or projects.
                </p>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
              <div className="flex flex-col gap-2">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((message) => {
          const sources = extractSources(message);
          const route = extractRoute(message);

          return (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role === "assistant" ? (
                <>
                  <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
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
                    {sources.length > 0 || route ? <SourcesPanel sources={sources} route={route} /> : null}
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
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something…"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={isStreaming || input.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
