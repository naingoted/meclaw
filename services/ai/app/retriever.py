"""Read-only retriever over the shared Qdrant collection. Mirrors the HTTP
contract of lib/rag/qdrant.ts + lib/rag/embed.ts so it matches TS ingest exactly
(spec §10). Python NEVER writes to Qdrant — ingestion stays in TypeScript."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import httpx

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
    url = (
        f"{config.QDRANT_URL.rstrip('/')}"
        f"/collections/{config.QDRANT_COLLECTION}/points/search"
    )
    response = httpx.post(
        url,
        json={"vector": vector, "limit": limit, "with_payload": True},
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json().get("result") or []


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
