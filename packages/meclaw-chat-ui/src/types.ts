export type ChatUiSource = {
  title: string;
  location: string;
  score?: string;
};

export type ChatUiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
  sources?: ChatUiSource[];
  route?: string;
  steps?: string[];
  corpusVersion?: number;
};

/** Presentational session row for the history drawer (data fetching stays in the app). */
export type ChatUiSession = {
  conversationId: string;
  /** First user message, truncated; empty until the first turn. */
  title: string;
  /** epoch ms, bumped on each turn */
  updatedAt: number;
};

export type ChatUiCopy = {
  emptyStateIntro: string;
  suggestionsLabel: string;
  messagePlaceholder: string;
  thinkingLabel: string;
  sendLabel?: string;
};

export const DEFAULT_CHAT_UI_COPY: ChatUiCopy = {
  emptyStateIntro: "Ask me anything",
  suggestionsLabel: "Try asking:",
  messagePlaceholder: "Say something…",
  thinkingLabel: "Thinking…",
  sendLabel: "Send",
};
