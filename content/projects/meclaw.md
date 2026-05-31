# meclaw — this chatbot

A personal "AI twin" chatbot. Visitors open a public chat page and ask an AI
about Thet — his experience, projects, and stack — and it answers on his behalf.

## How it works

- **Local-first:** runs entirely from a Next.js app — no cloud database, no
  signups. Knowledge lives in editable markdown files (`content/*.md`).
- **Context-stuffing, not RAG:** the corpus is small, so every doc is loaded
  straight into the system prompt. No embeddings in v1.
- **Provider-agnostic LLM:** built on the Vercel AI SDK; the model is `qwen3.6-plus`
  behind an Anthropic-compatible gateway, swappable by editing one file.
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 +
  shadcn/ui, Drizzle + SQLite, Zod, Vitest.

Thet built it himself as a demo of a clean, shippable local AI app.
