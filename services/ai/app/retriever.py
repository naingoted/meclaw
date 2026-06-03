"""Read-only retriever over the shared Postgres rag_chunks table (pgvector).
Embeds the query via Ollama, then runs a cosine kNN in Postgres. Python NEVER
writes the corpus — ingestion stays in TypeScript (lib/rag/*)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import httpx
import psycopg

from app import config

EmbedFn = Callable[[str], list[float]]
SearchFn = Callable[[list[float], int], list[dict]]


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    source: str
    title: str
    text: str
    ordinal: int
    score: float


@dataclass(frozen=True)
class RetrievalResult:
    chunks: list[RetrievedChunk]
    sources: list[dict]


def _default_embed(text: str) -> list[float]:
    response = httpx.post(
        f"{config.OLLAMA_BASE_URL.rstrip('/')}/api/embeddings",
        json={"model": config.OLLAMA_EMBED_MODEL, "prompt": text},
        timeout=30.0,
    )
    response.raise_for_status()
    embedding = response.json().get("embedding")
    if not isinstance(embedding, list):
        raise ValueError("Ollama response missing embedding array")
    return embedding


def _default_search(vector: list[float], limit: int) -> list[dict]:
    """Cosine kNN over rag_chunks (pgvector). The query vector is passed as a
    '[..]'::vector text-cast param; results never include the embedding column,
    so no pgvector adapter is needed. Returns the Qdrant-style hit shape the
    retriever already parses (payload + score)."""
    vec = "[" + ",".join(str(x) for x in vector) + "]"
    with psycopg.connect(config.DATABASE_URL) as conn:
        rows = conn.execute(
            "SELECT id, source, title, text, ordinal, "
            "1 - (embedding <=> %s::vector) AS score "
            "FROM rag_chunks ORDER BY embedding <=> %s::vector LIMIT %s",
            (vec, vec, limit),
        ).fetchall()
    return [
        {
            "payload": {
                "id": row[0],
                "source": row[1],
                "title": row[2],
                "text": row[3],
                "ordinal": row[4],
            },
            "score": row[5],
        }
        for row in rows
    ]


class Retriever:
    def __init__(
        self,
        embed_fn: EmbedFn | None = None,
        search_fn: SearchFn | None = None,
        top_k: int | None = None,
    ) -> None:
        self._embed = embed_fn or _default_embed
        self._search = search_fn or _default_search
        self._top_k = top_k if top_k is not None else config.RAG_TOP_K

    def retrieve(self, query: str) -> RetrievalResult:
        if not query.strip():
            return RetrievalResult(chunks=[], sources=[])

        vector = self._embed(query)
        hits = self._search(vector, self._top_k)

        chunks: list[RetrievedChunk] = []
        for hit in hits:
            payload = hit.get("payload") or {}
            try:
                chunks.append(
                    RetrievedChunk(
                        id=str(payload["id"]),
                        source=str(payload["source"]),
                        title=str(payload["title"]),
                        text=str(payload["text"]),
                        ordinal=int(payload["ordinal"]),
                        score=float(hit["score"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue

        return RetrievalResult(chunks=chunks, sources=_build_sources(chunks))

    def embed(self, query: str) -> list[float]:
        """Public embed seam: reused by the streaming layer to cluster misses
        without re-instantiating the embedder."""
        return self._embed(query)


def _build_sources(chunks: list[RetrievedChunk]) -> list[dict]:
    by_source: dict[str, dict] = {}
    for chunk in chunks:
        existing = by_source.get(chunk.source)
        if existing is None or chunk.score > existing["score"]:
            by_source[chunk.source] = {
                "source": chunk.source,
                "title": chunk.title,
                "score": chunk.score,
            }
    return list(by_source.values())
