# Knowledge corpus

This is the bot's knowledge. Everything the AI twin can say about the owner
comes from the markdown here — nothing else.

## Layout

| Path | Purpose | Tracked in git? |
|------|---------|-----------------|
| `personal.example.md` | Public-safe template for private owner profile/contact details. | ✅ placeholder |
| `personal.md` | Real owner profile/contact details copied from the example. | 🚫 git-ignored |
| `resume.md` | Skills, experience, education. | ✅ starter content |
| `projects/*.md` | One file per notable project. | ✅ |
| `knowledge/*.md` | Deeper corpus — career timeline, case studies, FAQs. Feeds RAG. | 🚫 git-ignored (your real files stay local) |

The loader (`lib/content.ts`) reads **all `*.md` under `content/` recursively**,
so any file you add anywhere here becomes knowledge after a restart / re-ingest.

### Work-impact packs (`data/work_impact_<company>/`)

Structured per-employer impact history lives outside `content/`, under
`data/work_impact_<company>/` (e.g. `work_impact_incube8`). Each pack holds a
`04_rag_entries.json` array of impact entries (`category`, `period`, `size`,
`summary`, `context_for_non_internal_audience`, `measurable_impact`,
`related_initiatives`, `confidence`). `lib/rag/loaders/work-impact.ts`
auto-discovers every such folder and renders it into one RAG doc per company
(slug `work/<company>`, H2 per category).

**Add another company** (shopback, asiaone, …): drop a new
`data/work_impact_<company>/04_rag_entries.json` and re-run `pnpm ingest`. No
code change. `data/**` is git-ignored, so internal history stays local.

## Privacy model

`content/personal.md`, `content/private/**`, `content/knowledge/**`, and
`data/**` are git-ignored so personal history never hits a public remote. The
only committed personal-profile file is `personal.example.md`, and the only
committed knowledge files are the **`*_sample_*` demos** in `knowledge/`, which
exist so the repo runs end-to-end on a fresh clone. Delete or replace the
samples once you've added your own local corpus.

## Adding your own

1. Copy `content/personal.example.md` to `content/personal.md` and fill in the
   real profile/contact details you want the chatbot to know.
2. Drop markdown into `content/knowledge/` — one topic per file, with an H1 and
   topic-scoped H2 sections (see the sample docs for the shape). Structure-aware
   chunking splits on those headings.
3. Restart `pnpm dev` (context-stuffing path) or re-run `pnpm ingest` (RAG path).
