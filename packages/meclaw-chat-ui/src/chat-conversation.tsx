"use client";

import type { FormEvent, RefObject } from "react";
import { ChatInput } from "./chat-input";
import { cn } from "./cn";
import { EmptyState } from "./empty-state";
import { LiveTrace } from "./live-trace";
import { formatDayLabel, isSameDay } from "./time";
import { AssistantTurn, UserTurn } from "./turns";
import type { ChatUiCopy, ChatUiMessage } from "./types";

export function ChatConversation({
  messages,
  greeting,
  suggestions,
  copy,
  input,
  onInputChange,
  onSubmit,
  onSuggestion,
  isStreaming,
  showThinking,
  liveSteps,
  showDevPanels = false,
  transcriptEndRef,
  inputRef,
  onTranscriptTouchStart,
  onTranscriptTouchEnd,
  className,
}: {
  messages: ChatUiMessage[];
  greeting: string;
  suggestions: string[];
  copy: ChatUiCopy;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onSuggestion: (text: string) => void;
  isStreaming: boolean;
  showThinking: boolean;
  liveSteps: string[];
  showDevPanels?: boolean;
  transcriptEndRef?: RefObject<HTMLDivElement | null>;
  inputRef?: RefObject<HTMLInputElement | null>;
  onTranscriptTouchStart?: () => void;
  onTranscriptTouchEnd?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div
        role="log"
        aria-label="Conversation"
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
        onTouchStart={onTranscriptTouchStart}
        onTouchEnd={onTranscriptTouchEnd}
      >
        {messages.length === 0 ? (
          <EmptyState
            greeting={greeting}
            suggestions={suggestions}
            copy={copy}
            onSuggestion={onSuggestion}
          />
        ) : null}
        {/* fallow-ignore-next-line complexity */}
        {messages.map((message, i) => {
          const prevTs = i > 0 ? messages[i - 1]?.timestamp : undefined;
          const ts = message.timestamp;
          const showDay = ts !== undefined && (prevTs === undefined || !isSameDay(ts, prevTs));
          const answered = message.role === "assistant" ? message.text.length > 0 : true;

          return (
            <div key={message.id}>
              {showDay ? (
                <div className="my-3 text-center font-mono text-xs text-muted-foreground">
                  {formatDayLabel(ts)}
                </div>
              ) : null}
              <div
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                {message.role === "assistant" ? (
                  <AssistantTurn
                    message={message}
                    answered={answered}
                    showDevPanels={showDevPanels}
                  />
                ) : (
                  <UserTurn message={message} />
                )}
              </div>
            </div>
          );
        })}
        {showThinking ? <LiveTrace steps={liveSteps} label={copy.thinkingLabel} /> : null}
        <div ref={transcriptEndRef} />
      </div>
      <ChatInput
        input={input}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        isStreaming={isStreaming}
        copy={copy}
        inputRef={inputRef}
      />
    </div>
  );
}
