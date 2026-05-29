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
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {message.role === "assistant" && (
              <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-5 w-5 text-foreground" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
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
          </div>
        ))}
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
