# meclaw — this chatbot

A personal "AI twin" chatbot. Visitors open a public chat page and ask an AI
about Thet — his experience, projects, and stack — and it answers on his behalf.

## How it works

- **Local-first:** runs from a Next.js app plus local services; no auth in v1.
  Knowledge lives in editable markdown files (`content/*.md`).
- **Local RAG:** markdown is embedded locally with Ollama and retrieved from
  Qdrant before each answer, with full-corpus fallback if retrieval is down.
- **Provider-agnostic LLM:** built on the Vercel AI SDK; the model is `qwen3.6-plus`
  behind an Anthropic-compatible gateway, swappable by editing one file.
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 +
  shadcn/ui, Drizzle + PostgreSQL, Zod, Vitest.

Thet built it himself as a demo of a clean, shippable local AI app.
