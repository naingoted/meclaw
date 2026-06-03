"""Derived corpus state — the Python half of the corpus contract.
See docs/ai/rag-corpus-contract.md (TS mirror: apps/admin/lib/admin/corpus.ts).
Read-only; NEVER writes the corpus. version = count of succeeded ingestion jobs."""

from __future__ import annotations

import logging
from typing import Callable

import psycopg

from app import config

logger = logging.getLogger(__name__)

# (sql, params) -> first column of the first row
FetchOne = Callable[..., object]

_VERSION_SQL = "SELECT count(*) FROM ingestion_jobs WHERE status = 'succeeded'"
_DOCS_SQL = "SELECT count(*) FROM documents WHERE status = 'ready'"
_CHUNKS_SQL = "SELECT count(*) FROM rag_chunks"
_LAST_SQL = 'SELECT max("lastIngestedAt") FROM documents'
_FULLTEXT_SQL = "SELECT text FROM rag_chunks ORDER BY source, ordinal"

# (sql, params) -> all rows
FetchAll = Callable[..., list]


def _default_fetch_one(sql: str, params=None):
    with psycopg.connect(config.DATABASE_URL) as conn:
        row = conn.execute(sql, params or ()).fetchone()
    return row[0] if row else None


def _default_fetch_all(sql: str, params=None):
    with psycopg.connect(config.DATABASE_URL) as conn:
        return conn.execute(sql, params or ()).fetchall()


def corpus_version(fetch_one: FetchOne | None = None) -> int | None:
    """Return the corpus version (count of succeeded ingestion jobs), or None on error.
    Degrades gracefully; never raises."""
    fetch = fetch_one or _default_fetch_one
    try:
        return int(fetch(_VERSION_SQL))
    except Exception:
        logger.warning("corpus_version query failed", exc_info=True)
        return None


def corpus_state(fetch_one: FetchOne | None = None) -> dict:
    """Return the full corpus state dict matching the TS contract.
    Degrades gracefully; never raises. On error, returns dict with None values
    except embedModel which always returns the configured value."""
    fetch = fetch_one or _default_fetch_one
    try:
        version = int(fetch(_VERSION_SQL))
        documents = int(fetch(_DOCS_SQL))
        chunks = int(fetch(_CHUNKS_SQL))
        last = fetch(_LAST_SQL)
        return {
            "version": version,
            "documents": documents,
            "chunks": chunks,
            "lastIngestedAt": last.isoformat() if hasattr(last, "isoformat") else last,
            "embedModel": config.OLLAMA_EMBED_MODEL,
        }
    except Exception:
        logger.warning("corpus_state query failed", exc_info=True)
        return {
            "version": None,
            "documents": None,
            "chunks": None,
            "lastIngestedAt": None,
            "embedModel": config.OLLAMA_EMBED_MODEL,
        }


def corpus_fulltext(fetch_all: FetchAll | None = None) -> tuple[str, int]:
    """Return (full corpus text, approx token count). The token estimate is
    chars/4 — coarse but enough to drive the tiny-corpus stuffing knob. Degrades
    to ("", 0) on error so callers fall back to normal retrieval."""
    fetch = fetch_all or _default_fetch_all
    try:
        rows = fetch(_FULLTEXT_SQL)
        text = "\n\n".join(str(r[0]) for r in rows)
        return text, len(text) // 4
    except Exception:
        logger.warning("corpus_fulltext query failed", exc_info=True)
        return "", 0
