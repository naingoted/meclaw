# Repo index — where things live

> Target layout. Items marked _(planned)_ arrive in a later milestone.

```
echo-clone/
├─ app/
│  ├─ layout.tsx · page.tsx          # public chat page (page = placeholder until M1)
│  ├─ globals.css                    # Tailwind 4 + shadcn theme tokens
│  └─ api/chat/route.ts              # POST streaming endpoint        (M1, planned)
├─ components/
│  ├─ chat/*                         # message list, input, chips, markdown (M1+, planned)
│  └─ ui/*                           # shadcn primitives (button added)
├─ lib/
│  ├─ utils.ts                       # cn() class merge helper
│  ├─ ai/provider.ts                 # anthropic provider: baseURL + model from env (M1, planned)
│  ├─ ai/persona.ts                  # build system prompt from content files (M2, planned)
│  ├─ ai/tools.ts                    # agent tools                    (M5, planned)
│  ├─ db/{schema,index,migrate}.ts   # drizzle + sqlite               (M3, planned)
│  └─ content.ts                     # load /content markdown         (M2, planned)
├─ content/persona.md · resume.md · projects/*.md   # owner data, editable (M2, planned)
├─ data/echo.db                      # sqlite, gitignored             (M3, planned)
├─ drizzle/                          # migrations                     (M3, planned)
├─ docs/ai/                          # HANDOFF + these orientation docs
├─ docs/superpowers/specs/           # design doc
├─ .github/{workflows/ci.yml,pull_request_template.md}
├─ .env.example                      # committed placeholders
└─ components.json                   # shadcn config
```

## Key entry points

- **Chat UI:** `app/page.tsx` → (M1) renders `useChat` client component.
- **LLM calls:** everything funnels through `lib/ai/provider.ts`.
- **Knowledge:** markdown in `content/` → loaded by `lib/content.ts` → stuffed into system prompt by `lib/ai/persona.ts`.
- **Config:** env vars in `.env.local` (see `.env.example`).
