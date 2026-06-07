"""Validation (Spec C §5): the robust core. Two stages — a cheap deterministic
heuristic gate, then an LLM-judge for results that pass the gate but are
borderline. Returns {verdict: good|bad, score, stage, reason}. The retry budget
and re-plan live in the graph (Task 11); this unit only judges one result."""

from __future__ import annotations

import json
import logging
import re
from typing import Callable

logger = logging.getLogger(__name__)

_JUDGE_SYSTEM = (
    "Score how well the research note answers its subtask, 0.0-1.0. Penalize vague, "
    "off-topic, or unsupported notes. Respond with ONLY JSON: "
    '{"score": <0.0-1.0>, "reason": "<short>"}.'
)


def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
        elif isinstance(block, str):
            parts.append(block)
    return "".join(parts)


def _top_corpus_score(note: dict) -> float | None:
    scores = [
        s.get("score")
        for s in (note.get("sources") or [])
        if isinstance(s, dict) and isinstance(s.get("score"), (int, float))
    ]
    return max(scores) if scores else None


def make_validator(
    judge_model,
    *,
    min_chars: int,
    judge_threshold: float,
    corpus_score_floor: float,
) -> Callable[[dict, dict], dict]:
    def _run(subtask: dict, note: dict) -> dict:
        text = (note.get("text") or "").strip()

        # Stage 1 — heuristic gate (deterministic, first).
        if not text:
            return {"verdict": "bad", "stage": "heuristic", "score": None, "reason": "empty"}
        if len(text) < min_chars:
            return {"verdict": "bad", "stage": "heuristic", "score": None, "reason": "too short"}
        if subtask.get("source") == "owner_corpus":
            top = _top_corpus_score(note)
            if top is not None and top < corpus_score_floor:
                return {
                    "verdict": "bad",
                    "stage": "heuristic",
                    "score": top,
                    "reason": f"top corpus score {top:.2f} < floor {corpus_score_floor:.2f}",
                }

        # Stage 2 — LLM judge.
        try:
            resp = judge_model.invoke(
                [
                    {"role": "system", "content": _JUDGE_SYSTEM},
                    {
                        "role": "user",
                        "content": f"Subtask: {subtask.get('query')}\nNote: {text[:2000]}",
                    },
                ]
            )
            raw = _extract_text(resp.content).strip()
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            score = float(json.loads(match.group(0) if match else raw)["score"])
        except Exception as exc:
            # Judge fault: don't fail-open. Treat as borderline-bad so the subtask
            # retries (bounded) rather than admitting an unscored note.
            logger.warning("Judge parse failed (%s); marking bad to trigger retry", exc)
            return {"verdict": "bad", "stage": "judge", "score": None, "reason": "judge error"}

        verdict = "good" if score >= judge_threshold else "bad"
        return {"verdict": verdict, "stage": "judge", "score": score, "reason": "judged"}

    return _run
