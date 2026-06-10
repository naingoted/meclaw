"""Synthesizer (Spec C §4 U4): assemble validated notes into a BriefingReport.
JSON-prompted into the pydantic schema; on parse failure returns a safe degraded
report (never crashes the run)."""

from __future__ import annotations

import json
import logging
import re
from typing import Callable

from pydantic import ValidationError

from app.research.schemas import BriefingReport

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You write a hiring briefing: how Thet's background maps to the target "
    "role/company, grounded ONLY in the provided notes. Produce JSON matching this "
    "shape exactly: {summary, fit_score (0-1 or null), matched_strengths: "
    "[{point, evidence, sources: [{kind, ref, title?}]}], gaps: [{point, note}], "
    "talking_points: [string], sources: [{kind, ref, title?}]}. kind is one of "
    "corpus|db|web. Respond with ONLY that JSON object."
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


def _notes_block(notes: list[dict]) -> str:
    lines = []
    for i, note in enumerate(notes):
        refs = ", ".join(
            str(s.get("source") or s.get("url"))
            for s in note.get("sources", [])
            if isinstance(s, dict)
        )
        lines.append(
            f"[note {i}] {note.get('text', '')}\n  sources: {refs or '(none)'}"
        )
    return "\n".join(lines) or "(no validated notes)"


def make_synthesizer(model) -> Callable[[dict, list[dict]], BriefingReport]:
    def _run(request: dict, notes: list[dict]) -> BriefingReport:
        user = (
            f"Target: {json.dumps(request)}\n\nValidated research notes:\n"
            + _notes_block(notes)
        )
        try:
            resp = model.invoke(
                [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user},
                ]
            )
            raw = _extract_text(resp.content).strip()
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            return BriefingReport.model_validate(
                json.loads(match.group(0) if match else raw)
            )
        except (
            json.JSONDecodeError,
            ValidationError,
            KeyError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Synthesis parse failed (%s); degraded report", exc)
            return BriefingReport(
                summary=(
                    "I couldn't assemble a full briefing from the available research. "
                    "The collected notes were incomplete."
                )
            )

    return _run
