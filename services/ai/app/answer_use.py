"""Deterministic `answer_used` heuristic: token-overlap between the draft and the
concatenated kept-chunk context. Pure function, no I/O, no LLM (spec §5.2). The
authoritative faithfulness number comes from the offline Ragas runner."""

from __future__ import annotations

import re

_TOKEN_RE = re.compile(r"\w+")


def _tokens(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def compute_answer_used(draft: str, context: str, threshold: float) -> bool:
    """True iff the share of the draft's distinct word tokens that also appear in
    `context` is >= `threshold`. False when either side is empty."""
    draft_tokens = _tokens(draft)
    context_tokens = _tokens(context)
    if not draft_tokens or not context_tokens:
        return False
    overlap = len(draft_tokens & context_tokens) / len(draft_tokens)
    return overlap >= threshold
