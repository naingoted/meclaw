"""Conservative deterministic detector for answer-level missing-fact admissions.

Used after a grounded NON-TOOL draft streams: if retrieval passed the score floor
but the model still says it doesn't actually have the requested fact, that turn is
a gap (reason 'answer_gap'), not a silent hit. Substring match on a small list of
explicit phrases — intentionally narrow so normal grounded answers are never
flagged. NOT an LLM judge (out of scope, spec §9)."""

from __future__ import annotations

# Lowercased phrases that signal the draft is admitting the fact is absent.
# Keep this list tight: each phrase must be an explicit not-known/not-present
# statement, not generic hedging.
_MISSING_FACT_PHRASES: tuple[str, ...] = (
    "does not explicitly state",
    "doesn't explicitly state",
    "not explicitly stated",
    "i don't know",
    "i do not know",
    "i'm not certain",
    "i am not certain",
    "not in the provided context",
    "does not include",
    "doesn't include",
    "don't include",
    "not mentioned",
    "isn't mentioned",
    "is not mentioned",
)


def is_missing_fact_answer(text: str) -> bool:
    """True iff the draft contains an explicit missing-fact admission."""
    if not text:
        return False
    lowered = text.lower()
    return any(phrase in lowered for phrase in _MISSING_FACT_PHRASES)
