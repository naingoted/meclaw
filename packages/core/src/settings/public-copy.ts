export type PublicCopy = {
  emptyStateIntro: string;
  suggestionsLabel: string;
  messagePlaceholder: string;
  thinkingLabel: string;
  footerPrefix: string;
  resumeLabel: string;
  bookCallLabel: string;
  bookShortLabel: string;
  githubLabel: string;
};

export const DEFAULT_PUBLIC_COPY: PublicCopy = {
  emptyStateIntro: "Ask me anything about how leanior works",
  suggestionsLabel: "Try asking:",
  messagePlaceholder: "Say something…",
  thinkingLabel: "Thinking…",
  footerPrefix: "Built this myself",
  resumeLabel: "Résumé",
  bookCallLabel: "Book a call",
  bookShortLabel: "Book",
  githubLabel: "GitHub",
};
