"""Rolling history cap (caching spec lever 1).

Bounds the per-request prompt size sent to the LLM: keep the most recent
`max_messages`, then drop the oldest survivors while the estimated token total
exceeds `token_budget`. The last message (the live user turn) is never dropped.

Token estimate is the standard chars/4 heuristic — exactness doesn't matter,
only that growth is bounded. Real summarizing windowing (the context-windowing
spec) replaces this drop path later at the same call site in streaming.py.
"""

from __future__ import annotations


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _total(messages: list[dict]) -> int:
    return sum(estimate_tokens(str(m.get("content", ""))) for m in messages)


def cap_history(
    messages: list[dict], *, max_messages: int = 10, token_budget: int = 2000
) -> list[dict]:
    # max_messages <= 0: no count cap applied (return full list)
    capped = list(messages[-max_messages:]) if max_messages > 0 else list(messages)
    while len(capped) > 1 and _total(capped) > token_budget:
        capped.pop(0)
    return capped


def fit_to_budget(chunks, messages, *, budget, text_of=lambda c: c.text):
    """Drop OLDEST chunks first, then OLDEST history messages, until the combined
    estimated-token total fits `budget`. The final message (live user turn) is
    never dropped — mirrors cap_history. Returns (kept_chunks, kept_messages).
    Defensive prompt cap (caching lever 6); chars/4 estimate."""
    # Work on copies
    kept_chunks = list(chunks)
    kept_messages = list(messages)

    # Compute total tokens
    total = sum(estimate_tokens(text_of(c)) for c in kept_chunks) + sum(
        estimate_tokens(str(m.get("content", ""))) for m in kept_messages
    )

    # Drop oldest chunks first
    while kept_chunks and total > budget:
        removed = kept_chunks.pop(0)
        total -= estimate_tokens(text_of(removed))

    # Drop oldest messages (but never the last one)
    while len(kept_messages) > 1 and total > budget:
        removed = kept_messages.pop(0)
        total -= estimate_tokens(str(removed.get("content", "")))

    return kept_chunks, kept_messages
