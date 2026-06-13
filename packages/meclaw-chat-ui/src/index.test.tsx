import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";
import { MessageMeta } from "./message-meta";
import {
  appendStep,
  groundingLabel,
  hasRenderedText,
  parseMessageCreatedAt,
  shouldShowThinking,
} from "./utils";
import { VersionBadge } from "./version-badge";

const TS = new Date(2026, 5, 10, 14, 5).getTime();

describe("VersionBadge", () => {
  afterEach(() => cleanup());

  it("renders the release label with an accessible name", () => {
    render(<VersionBadge label="meclaw · v1.2.3 · abc1234" />);
    expect(screen.getByLabelText("Release meclaw · v1.2.3 · abc1234")).toHaveTextContent(
      "meclaw · v1.2.3 · abc1234",
    );
  });
});

describe("ChatInput", () => {
  afterEach(() => cleanup());

  it("uses mobile-safe input sizing", () => {
    render(
      <ChatInput
        input=""
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        isStreaming={false}
        copy={{
          emptyStateIntro: "Ask",
          suggestionsLabel: "Try",
          messagePlaceholder: "Say something...",
          thinkingLabel: "Thinking...",
        }}
      />,
    );

    expect(screen.getByLabelText("Message")).toHaveClass("min-w-0", "text-base");
  });
});

describe("MessageMeta", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the formatted time with a full datetime title", () => {
    render(<MessageMeta timestamp={TS} text="hi" />);
    const time = screen.getByText(/2:05/);
    expect(time).toHaveAttribute("title");
  });

  it("renders an em dash when timestamp is missing", () => {
    render(<MessageMeta text="hi" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("copies the message text on click", async () => {
    render(<MessageMeta timestamp={TS} text="copy me" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copy me"));
  });
});

describe("parseMessageCreatedAt", () => {
  it("parses ISO metadata.createdAt", () => {
    expect(parseMessageCreatedAt({ createdAt: "2026-06-10T14:05:00.000Z" })).toBe(
      Date.parse("2026-06-10T14:05:00.000Z"),
    );
  });
  it("returns undefined for invalid or missing values", () => {
    expect(parseMessageCreatedAt(null)).toBeUndefined();
    expect(parseMessageCreatedAt({ createdAt: "not-a-date" })).toBeUndefined();
  });
});

describe("appendStep", () => {
  it("appends a new label", () => {
    expect(appendStep(["Routing…"], "Searching…")).toEqual(["Routing…", "Searching…"]);
  });
  it("dedupes consecutive duplicates", () => {
    expect(appendStep(["Routing…"], "Routing…")).toEqual(["Routing…"]);
  });
});

describe("hasRenderedText", () => {
  it("detects non-empty text parts", () => {
    expect(hasRenderedText({ parts: [{ type: "text", text: "hi" }] })).toBe(true);
  });
  it("rejects empty parts", () => {
    expect(hasRenderedText({ parts: [] })).toBe(false);
  });
});

describe("shouldShowThinking", () => {
  const userMsg = { role: "user", parts: [{ type: "text", text: "hi" }] };
  const assistantWithText = { role: "assistant", parts: [{ type: "text", text: "answer" }] };

  it("shows while submitted", () => {
    expect(shouldShowThinking("submitted", [userMsg])).toBe(true);
  });
  it("hides once assistant text streams", () => {
    expect(shouldShowThinking("streaming", [userMsg, assistantWithText])).toBe(false);
  });
});

describe("groundingLabel", () => {
  it("labels tech route with sources", () => {
    expect(groundingLabel("tech", 2)).toBe("grounded on 2 sources");
  });
  it("labels gap route", () => {
    expect(groundingLabel("gap", 1)).toBe("saved answer");
  });
});
