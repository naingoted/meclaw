"""Planner (Spec C §4 U1): decompose a briefing request into typed research
subtasks, and re-plan a single subtask with a revised query after a bad verdict.
JSON-prompted (reuses the tolerant parse from app/graph/nodes.py)."""

from __future__ import annotations

import json
import logging
import re
from typing import Callable
from uuid import uuid4

logger = logging.getLogger(__name__)

_VALID_SOURCES = {"owner_corpus", "owner_db", "web"}

_PLAN_SYSTEM = (
    "You plan research for a briefing on how Thet's background fits a target "
    "role/company. Decompose the request into focused subtasks. Tag each with a "
    "source: owner_corpus (Thet's knowledge corpus), owner_db (Thet's database), "
    "or web (the target company/role). Cover both Thet's side and the target. "
    'Respond with ONLY JSON: {"subtasks": [{"query": "...", "source": "..."}]}.'
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


def _parse_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(match.group(0) if match else text)


def _request_text(request: dict) -> str:
    parts = [f"{k}: {v}" for k, v in request.items() if v]
    return "\n".join(parts) or "(no details provided)"


def make_planner(model, max_subtasks: int) -> Callable[[dict], list[dict]]:
    def _run(request: dict) -> list[dict]:
        try:
            resp = model.invoke(
                [
                    {"role": "system", "content": _PLAN_SYSTEM},
                    {"role": "user", "content": _request_text(request)},
                ]
            )
            parsed = _parse_json(_extract_text(resp.content).strip())
            raw = parsed.get("subtasks") or []
        except Exception as exc:
            logger.warning("Planner parse failed (%s); one corpus subtask", exc)
            raw = [{"query": _request_text(request), "source": "owner_corpus"}]

        subtasks: list[dict] = []
        for item in raw[:max_subtasks]:
            source = item.get("source")
            subtasks.append(
                {
                    "id": uuid4().hex[:8],
                    "query": str(item.get("query", "")).strip() or _request_text(request),
                    "source": source if source in _VALID_SOURCES else "web",
                    "status": "pending",
                    "retry_count": 0,
                    "verdict": None,
                    "score": None,
                }
            )
        if not subtasks:  # empty list from the model → one safe corpus subtask
            subtasks.append(
                {
                    "id": uuid4().hex[:8],
                    "query": _request_text(request),
                    "source": "owner_corpus",
                    "status": "pending",
                    "retry_count": 0,
                    "verdict": None,
                    "score": None,
                }
            )
        return subtasks

    return _run


_REPLAN_SYSTEM = (
    "A research subtask produced a weak/empty result. Rewrite ONLY its query to be "
    "more specific and likely to retrieve evidence. Keep the same intent. "
    'Respond with ONLY JSON: {"query": "..."}.'
)


def make_replanner(model) -> Callable[[dict, str], dict]:
    def _run(subtask: dict, reason: str) -> dict:
        try:
            resp = model.invoke(
                [
                    {"role": "system", "content": _REPLAN_SYSTEM},
                    {
                        "role": "user",
                        "content": f"query: {subtask.get('query')}\nreason: {reason}",
                    },
                ]
            )
            new_query = str(_parse_json(_extract_text(resp.content).strip())["query"]).strip()
        except Exception as exc:
            logger.warning("Replanner parse failed (%s); appending a refinement hint", exc)
            new_query = f"{subtask.get('query')} (specific facts, with evidence)"
        revised = dict(subtask)
        revised["query"] = new_query or subtask.get("query")
        return revised

    return _run
