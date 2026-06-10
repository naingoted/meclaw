# Contributing

meclaw is a personal project maintained by one person, but issues and PRs are welcome.

## Before you start

- **Bugs / questions** — open an issue. Include repro steps and your environment (OS, Node, pnpm, Docker versions).
- **Features** — open an issue first to discuss. The project is intentionally small; not every good idea fits its scope (single-owner AI twin, local-first, no managed cloud services).
- **Small fixes** (typos, docs, obvious bugs) — PRs straight away are fine.

## Dev setup

Follow the Quickstart in [README.md](README.md). `docs/ai/setup.md` has the full local-dev reference, `docs/ai/architecture.md` explains how the pieces fit.

## Quality gates

The repo enforces its own standards — write code that passes on the first commit:

```bash
pnpm format        # Biome (formatter) — run before committing
pnpm verify        # lint + typecheck + build, all packages
pnpm test          # Vitest (JS) — pytest lives in services/ai
```

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …) — enforced by commitlint.
- **Tests first**: features come with a failing test before the implementation. Mock the LLM provider — no live calls in tests.
- **No secrets**: secretlint scans staged files; never commit filled `.env*` files (only `*.example` placeholders are tracked).
- Pre-commit and pre-push hooks run these automatically. Don't bypass them with `--no-verify` — fix the finding instead.

## License

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
