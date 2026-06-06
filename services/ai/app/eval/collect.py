"""Collect mode (spec §7.1): drive the REAL run_stream pipeline for one case and
accumulate its SSE into a scored-case input. We parse the same UI-message-stream
frames the browser consumes, so evals score the production path, not a mock.

Kept-chunk TEXT (needed by Ragas as `contexts`) is not in the SSE metadata — the
`retrieval.chunks` entries carry id/source/score/kept only. The caller therefore
passes `chunk_text_by_id` (a map captured from the real retriever, see run.py);
collect picks the kept ids out of the terminal `retrieval` metadata and resolves
their text through that map."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable, Iterator

RunnerFn = Callable[[list[dict]], Iterator[str]]


@dataclass(frozen=True)
class CollectResult:
    answer: str
    contexts: list[str]
    retrieval: dict | None


def _parse_frames(body_frames: Iterator[str]) -> tuple[str, dict | None]:
    """Accumulate text-delta content and capture the terminal retrieval metadata
    from the finish frame."""
    answer = ""
    retrieval: dict | None = None
    for frame in body_frames:
        for line in frame.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            if payload in ("", "[DONE]"):
                continue
            try:
                part = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if part.get("type") == "text-delta" and isinstance(part.get("delta"), str):
                answer += part["delta"]
            meta = part.get("messageMetadata")
            if meta is not None and "retrieval" in meta:
                retrieval = meta["retrieval"]
    return answer, retrieval


def collect_case(
    runner: RunnerFn,
    question: str,
    *,
    chunk_text_by_id: dict[str, str] | None = None,
) -> CollectResult:
    """Run `runner` for a single-question conversation and collect the result.

    `chunk_text_by_id` optionally maps chunk id → text so kept chunks become
    Ragas contexts. The eval run wires this from the retriever it built (see
    run.py). When omitted, contexts is empty (still lets reference-free,
    answer-only metrics run)."""
    messages = [{"role": "user", "content": question}]
    answer, retrieval = _parse_frames(runner(messages))

    contexts: list[str] = []
    if retrieval and chunk_text_by_id:
        contexts = [
            chunk_text_by_id[c["id"]]
            for c in retrieval.get("chunks", [])
            if c.get("kept") and c["id"] in chunk_text_by_id
        ]
    return CollectResult(answer=answer, contexts=contexts, retrieval=retrieval)
