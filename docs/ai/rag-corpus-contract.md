# RAG corpus-state contract

Derived corpus state, implemented in two runtimes that MUST stay in sync:
- TypeScript (admin): `apps/admin/lib/admin/corpus.ts` (`getCorpusState`)
- Python (ai): `services/ai/app/corpus.py` (`corpus_state` / `corpus_version`)

| field | SQL |
|---|---|
| version | `SELECT count(*) FROM ingestion_jobs WHERE status='succeeded'` |
| documents | `SELECT count(*) FROM documents WHERE status='ready'` |
| chunks | `SELECT count(*) FROM rag_chunks` |
| lastIngestedAt | `SELECT max("lastIngestedAt") FROM documents` (nullable → ISO string) |
| embedModel | env `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`) |

`version` is monotonic per successful ingest (a retry bumps it; deleting a doc
does not lower it). Informational only — nothing is gated or cached on it.
Surfaced in: admin corpus strip, chat dev sources panel (`corpus v{n}`), and
`GET /corpus-status` (ai) / `GET /api/admin/corpus` (admin).
