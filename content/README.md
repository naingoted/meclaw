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
| `knowledge/**/*.{md,pdf}` | Main private corpus — career timeline, case studies, FAQs. Feeds RAG. | 🚫 git-ignored (samples + `.gitkeep` only) |
| `private/**/*.{md,pdf}` | Local-only sensitive-but-ingestable notes. Feeds RAG, never the public repo. | 🚫 git-ignored (`.gitkeep` only) |

The markdown loader (`packages/core/src/content`) reads **all `*.md` under
`content/` recursively**, so markdown you add here can be seeded into the admin
Documents table. The RAG ingest loader also reads PDFs under `content/`.

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

`content/personal.md`, real `content/private/**`, real `content/knowledge/**`,
and `data/**` payloads are git-ignored so personal history never hits a public
remote. The only committed personal-profile file is `personal.example.md`; the
only committed corpus files are the **`*_sample_*` demos**, `.gitkeep` folder
markers, and `data/work_impact_example/04_rag_entries.example.json`, which exist
so the repo shows the expected first-run shape.

## Adding your own

1. Copy `content/personal.example.md` to `content/personal.md` and fill in the
   real profile/contact details you want the chatbot to know.
2. Drop markdown or PDFs into `content/knowledge/` for normal private corpus
   files. Use one topic per markdown file, with an H1 and topic-scoped H2
   sections (see the sample docs for the shape). Structure-aware chunking splits
   on those headings.
3. Put sensitive-but-ingestable notes in `content/private/` when you want the bot
   to know them locally but never want them in Git.
4. For structured employer impact, copy
   `data/work_impact_example/04_rag_entries.example.json` to
   `data/work_impact_<company>/04_rag_entries.json` and fill it in.
5. First setup:
   ```bash
   pnpm --filter @meclaw/admin seed:docs  # imports content/**/*.md into Documents
   pnpm ingest                            # embeds markdown, PDFs, and work-impact packs
   ```
