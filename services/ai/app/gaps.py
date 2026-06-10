"""Online embedding clustering for RAG gaps (misses). The router (Python) owns
gap_clusters: each miss folds into the nearest open cluster within a radius
(cosine distance), else spawns a new one. NEVER writes the corpus — gap_clusters
is observability only. Mirrors retriever.py's psycopg style; DB ops are injected
so unit tests run without a live database."""

from __future__ import annotations

import logging
from typing import Callable, Optional, TypedDict

import psycopg

from app import config

logger = logging.getLogger(__name__)


class NearestCluster(TypedDict):
    id: str
    distance: float
    count: int
    centroid: list[float]


SearchFn = Callable[
    [list[float]], Optional[NearestCluster]
]  # embedding -> nearest open cluster | None
UpdateFn = Callable[[str, list[float]], None]  # (cluster_id, new_centroid) -> None
InsertFn = Callable[[list[float], str], str]  # (embedding, query) -> new cluster id


def _incremental_mean(
    centroid: list[float], count: int, embedding: list[float]
) -> list[float]:
    """Running mean: fold one new member into an existing centroid."""
    n = count + 1
    return [(c * count + e) / n for c, e in zip(centroid, embedding)]


def assign_cluster(
    embedding: list[float],
    query: str,
    *,
    search_fn: SearchFn | None = None,
    update_fn: UpdateFn | None = None,
    insert_fn: InsertFn | None = None,
    radius: float | None = None,
) -> str:
    """Fold a miss embedding into the nearest OPEN ('new') cluster within `radius`,
    else create a new cluster. Returns the cluster id."""
    search = search_fn or _default_search
    update = update_fn or _default_update
    insert = insert_fn or _default_insert
    r = radius if radius is not None else config.CLUSTER_RADIUS

    nearest = search(embedding)
    if nearest is not None and nearest["distance"] <= r:
        new_centroid = _incremental_mean(
            nearest["centroid"], nearest["count"], embedding
        )
        update(nearest["id"], new_centroid)
        return nearest["id"]
    return insert(embedding, query)


def _vec(values: list[float]) -> str:
    return "[" + ",".join(str(x) for x in values) + "]"


def _parse_vec(text: str) -> list[float]:
    return [float(x) for x in text.strip().lstrip("[").rstrip("]").split(",") if x]


def _default_search(embedding: list[float]) -> NearestCluster | None:
    """Nearest 'new' cluster by cosine distance. centroid returned as ::text and
    parsed back — no pgvector adapter needed."""
    vec = _vec(embedding)
    with psycopg.connect(config.DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT id::text, count, centroid::text, "
            "(centroid <=> %s::vector) AS distance "
            "FROM gap_clusters WHERE status = 'new' "
            "ORDER BY centroid <=> %s::vector LIMIT 1",
            (vec, vec),
        ).fetchone()
    if row is None:
        return None
    return NearestCluster(
        id=row[0],
        count=int(row[1]),
        centroid=_parse_vec(row[2]),
        distance=float(row[3]),
    )


def _default_update(cluster_id: str, new_centroid: list[float]) -> None:
    vec = _vec(new_centroid)
    with psycopg.connect(config.DATABASE_URL) as conn:
        conn.execute(
            "UPDATE gap_clusters SET count = count + 1, centroid = %s::vector, "
            '"updatedAt" = now() WHERE id = %s::uuid',
            (vec, cluster_id),
        )
        conn.commit()


def _default_insert(embedding: list[float], query: str) -> str:
    vec = _vec(embedding)
    with psycopg.connect(config.DATABASE_URL) as conn:
        row = conn.execute(
            "INSERT INTO gap_clusters "
            '(id, centroid, count, status, "exemplarQuery", "createdAt", "updatedAt") '
            "VALUES (gen_random_uuid(), %s::vector, 1, 'new', %s, now(), now()) "
            "RETURNING id::text",
            (vec, query),
        ).fetchone()
        conn.commit()
    return row[0]
