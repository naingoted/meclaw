"""Resolved-gap fast path: nearest resolved gap cluster for a query embedding,
returning the curated document body for verbatim emission. Matching is against
the cluster CENTROID — the same embedding space that captured the original
misses, so a re-asked question lands by construction. Mirrors gaps.py's
injectable psycopg style so unit tests run without a live database. Read-only;
NEVER writes."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional

import psycopg

from app import config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResolvedAnswer:
    answer: str
    document_id: str
    cluster_id: str
    title: str
    distance: float


# embedding -> nearest resolved cluster row (dict) | None
SearchFn = Callable[[list[float]], Optional[dict]]

_SEARCH_SQL = (
    'SELECT gc.id::text, gc."resolvedDocumentId"::text, '
    "(gc.centroid <=> %s::vector) AS distance, d.title, d.body "
    "FROM gap_clusters gc "
    'LEFT JOIN documents d ON d.id = gc."resolvedDocumentId" '
    "WHERE gc.status = 'resolved' "
    "ORDER BY gc.centroid <=> %s::vector LIMIT 1"
)


def _vec(values: list[float]) -> str:
    return "[" + ",".join(str(x) for x in values) + "]"


def _default_search(embedding: list[float]) -> dict | None:
    vec = _vec(embedding)
    with psycopg.connect(config.DATABASE_URL) as conn:
        row = conn.execute(_SEARCH_SQL, (vec, vec)).fetchone()
    if row is None:
        return None
    return {
        "cluster_id": row[0],
        "document_id": row[1],
        "distance": float(row[2]),
        "title": row[3],
        "body": row[4],
    }


def strip_title_heading(body: str, title: str) -> str:
    """Drop a leading markdown heading that merely repeats the document title —
    gap-resolution docs typically start with the question as an `# H1`."""
    lines = body.splitlines()
    if not lines:
        return body
    first = lines[0].strip()
    if (
        first.startswith("#")
        and first.lstrip("#").strip().lower() == title.strip().lower()
    ):
        return "\n".join(lines[1:]).lstrip("\n")
    return body


def find_resolved_answer(
    embedding: list[float], *, search_fn: SearchFn | None = None
) -> ResolvedAnswer | None:
    """Nearest resolved cluster with a usable linked document, else None.
    Threshold gating is the caller's job (streaming compares distance).
    A resolved cluster whose document is gone (dangling) or empty is a
    no-match, never an error."""
    search = search_fn or _default_search
    row = search(embedding)
    if row is None:
        return None
    if not row.get("document_id") or row.get("body") is None:
        logger.warning(
            "Resolved gap cluster %s is dangling (no linked document)",
            row.get("cluster_id"),
        )
        return None
    title = str(row.get("title") or "")
    answer = strip_title_heading(str(row["body"]), title)
    if not answer.strip():
        logger.warning(
            "Resolved gap document %s has empty body; skipping fast path",
            row["document_id"],
        )
        return None
    return ResolvedAnswer(
        answer=answer,
        document_id=str(row["document_id"]),
        cluster_id=str(row["cluster_id"]),
        title=title,
        distance=float(row["distance"]),
    )
