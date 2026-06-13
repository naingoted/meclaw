"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "./cn";
import { MessageMeta } from "./message-meta";
import type { ChatUiMessage, ChatUiSource } from "./types";
import { groundingLabel } from "./utils";

// Content bubbles use font-sans (Hanken) so prose reads naturally; chrome stays mono.
const PROSE_BUBBLE =
  "prose prose-sm max-w-none overflow-hidden break-words font-sans dark:prose-invert";

function SourcesPanel({
  sources,
  route,
  label,
  corpusVersion,
}: {
  sources: ChatUiSource[];
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
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            Routed: {route}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-2">
        {sources.map((source, index) => (
          <li key={`${source.location}-${index}`} className="space-y-0.5">
            <p className="font-medium text-foreground">{source.title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4">
              <span className="break-words">{source.location}</span>
              {source.score ? (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  Score {source.score}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThinkingTrace({ steps }: { steps: string[] }) {
  return (
    <details className="max-w-[85%] rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
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

// fallow-ignore-next-line complexity
export function AssistantTurn({
  message,
  answered,
  showDevPanels = false,
}: {
  message: ChatUiMessage;
  answered: boolean;
  showDevPanels?: boolean;
}) {
  const sources = showDevPanels ? (message.sources ?? []) : [];
  const route = showDevPanels ? message.route : undefined;
  const steps = message.steps ?? [];
  const label =
    showDevPanels && (sources.length > 0 || route)
      ? groundingLabel(route, sources.length)
      : undefined;

  return (
    <section aria-label="Assistant says" className="min-w-0 space-y-2">
      <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-foreground max-w-[85%]">
        <div className={PROSE_BUBBLE}>
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>
      </div>
      {answered ? <MessageMeta timestamp={message.timestamp} text={message.text} /> : null}
      {answered && showDevPanels && (sources.length > 0 || route) ? (
        <SourcesPanel
          sources={sources}
          route={route}
          label={label}
          corpusVersion={message.corpusVersion}
        />
      ) : null}
      {answered && steps.length > 0 ? <ThinkingTrace steps={steps} /> : null}
    </section>
  );
}

export function UserTurn({ message }: { message: ChatUiMessage }) {
  return (
    <section aria-label="You said" className="flex flex-col items-end max-w-[85%]">
      <div
        className={cn(
          "rounded-2xl px-4 py-2 text-sm",
          "bg-primary text-primary-foreground",
          "w-fit",
        )}
      >
        <div className={PROSE_BUBBLE}>
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>
      </div>
      <MessageMeta timestamp={message.timestamp} text={message.text} />
    </section>
  );
}
