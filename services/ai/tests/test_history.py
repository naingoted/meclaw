"""History cap (caching spec lever 1): rolling message window + token budget."""

from unittest.mock import patch

from app.graph.nodes import TriageResult
from app.history import cap_history, estimate_tokens, fit_to_budget
from app.lead import (
    has_prior_confirm,
    most_recent_offer_trigger,
    prior_offer_made,
    prior_user_question,
)
from app.retriever import RetrievalResult, RetrievedChunk
from app.streaming import run_stream


def _msg(role: str, content: str) -> dict:
    return {"role": role, "content": content}


def test_estimate_tokens_is_chars_over_four_min_one():
    assert estimate_tokens("") == 1
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("a" * 400) == 100


def test_short_history_passes_through_unchanged():
    messages = [_msg("user", "hi"), _msg("assistant", "hello"), _msg("user", "ok")]
    assert cap_history(messages, max_messages=10, token_budget=2000) == messages


def test_message_count_cap_keeps_most_recent():
    messages = [_msg("user", f"m{i}") for i in range(30)]
    capped = cap_history(messages, max_messages=10, token_budget=2000)
    assert len(capped) == 10
    assert capped[-1]["content"] == "m29"
    assert capped[0]["content"] == "m20"


def test_token_budget_drops_oldest_first():
    messages = [_msg("user", str(i) * 400) for i in range(5)]
    capped = cap_history(messages, max_messages=10, token_budget=250)
    assert [m["content"][0] for m in capped] == ["3", "4"]


def test_empty_messages():
    """Empty history returns empty list."""
    assert cap_history([], max_messages=10, token_budget=2000) == []


def test_max_messages_zero_returns_full():
    """max_messages=0 means no count cap applied (return full list)."""
    messages = [_msg("user", f"m{i}") for i in range(30)]
    result = cap_history(messages, max_messages=0, token_budget=2000)
    assert result == messages
    assert len(result) == 30


def test_always_keeps_the_last_message_even_over_budget():
    messages = [_msg("user", "x" * 40_000)]
    capped = cap_history(messages, max_messages=10, token_budget=100)
    assert capped == messages


def test_does_not_mutate_input():
    messages = [_msg("user", f"m{i}") for i in range(20)]
    before = list(messages)
    cap_history(messages, max_messages=5, token_budget=2000)
    assert messages == before


def test_run_stream_caps_messages_sent_to_draft_but_scans_full_history():
    """Draft gets capped history; has_prior_confirm scans full history."""
    seen: dict = {}

    def triage_fn(messages):
        seen["triage"] = messages
        return TriageResult(intent="general", confidence=0.9, clarifying_question=None)

    def draft_stream_fn(system, messages, context):
        seen["draft"] = messages
        yield "ok"

    class _Chunk:
        id = "c1"
        source = "s"
        score = 0.9
        text = "chunk text"

    history = [{"role": "user", "content": f"m{i}"} for i in range(30)]

    with (
        patch(
            "app.streaming.has_prior_confirm", wraps=has_prior_confirm
        ) as mock_has_prior_confirm,
    ):
        list(
            run_stream(
                history,
                triage_fn=triage_fn,
                retriever_retrieve=lambda q: RetrievalResult(
                    chunks=[_Chunk()], sources=[{"source": "s"}]
                ),
                draft_stream_fn=draft_stream_fn,
                schedule_fn=dict,
                contact_fn=dict,
                history_max_messages=10,
                history_token_budget=2000,
            )
        )

    assert len(seen["draft"]) == 10
    assert seen["draft"][-1]["content"] == "m29"
    assert len(seen["triage"]) <= 6  # triage window applies on top of the cap

    # has_prior_confirm (called unconditionally) got full 30-message history
    assert mock_has_prior_confirm.called
    call_args = mock_has_prior_confirm.call_args[0][0]
    assert len(call_args) == 30, (
        f"has_prior_confirm should receive full 30-message history, got {len(call_args)}"
    )


def test_run_stream_fallback_lead_markers_see_full_history():
    """Fallback path: prior_offer_made scans full history."""

    history = [{"role": "user", "content": f"m{i}"} for i in range(30)]

    # Non-grounded retrieval → fallback_text() → prior_offer_made(messages)
    with (
        patch(
            "app.streaming.prior_offer_made", wraps=prior_offer_made
        ) as mock_prior_offer,
    ):
        list(
            run_stream(
                history,
                triage_fn=lambda m: TriageResult(
                    intent="general", confidence=0.9, clarifying_question=None
                ),
                retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
                draft_stream_fn=lambda s, m, c: (yield "ok"),
                schedule_fn=dict,
                contact_fn=dict,
                history_max_messages=10,
                history_token_budget=2000,
            )
        )

    assert mock_prior_offer.called
    call_args = mock_prior_offer.call_args[0][0]
    assert len(call_args) == 30, (
        f"prior_offer_made should receive full 30-message history, got {len(call_args)}"
    )


def test_run_stream_contact_capture_lead_markers_see_full_history():
    """Contact capture path: prior_user_question and most_recent_offer_trigger see full history."""

    # Last message contains an email → triggers contact capture path
    history = [{"role": "user", "content": f"m{i}"} for i in range(29)]
    history.append({"role": "user", "content": "my email is test@example.com"})

    with (
        patch(
            "app.streaming.prior_user_question", wraps=prior_user_question
        ) as mock_prior_question,
        patch(
            "app.streaming.most_recent_offer_trigger", wraps=most_recent_offer_trigger
        ) as mock_offer_trigger,
    ):
        list(
            run_stream(
                history,
                triage_fn=lambda m: TriageResult(
                    intent="general", confidence=0.9, clarifying_question=None
                ),
                retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
                draft_stream_fn=lambda s, m, c: (yield "ok"),
                schedule_fn=dict,
                contact_fn=dict,
                history_max_messages=10,
                history_token_budget=2000,
            )
        )

    assert mock_prior_question.called, (
        "prior_user_question should be called in contact path"
    )
    assert mock_offer_trigger.called, (
        "most_recent_offer_trigger should be called in contact path"
    )

    for mock_fn, fn_name in [
        (mock_prior_question, "prior_user_question"),
        (mock_offer_trigger, "most_recent_offer_trigger"),
    ]:
        call_args = mock_fn.call_args[0][0]
        assert len(call_args) == 30, (
            f"{fn_name} should receive full 30-message history, got {len(call_args)}"
        )


# --- Tests for fit_to_budget (caching spec lever 6) ---


def _chunk(text: str, id_suffix: str = "0") -> RetrievedChunk:
    return RetrievedChunk(
        id=f"c{id_suffix}",
        source=f"s{id_suffix}.md",
        title=f"Source {id_suffix}",
        text=text,
        ordinal=int(id_suffix),
        score=0.8,
    )


def test_fit_to_budget_under_budget_unchanged():
    """Chunks and messages under budget are unchanged."""
    chunks = [_chunk("a" * 100)]
    messages = [_msg("user", "hello"), _msg("assistant", "world")]
    # Each chunk/message is small; total is ~75 tokens
    kept_chunks, kept_messages = fit_to_budget(
        chunks, messages, budget=1000
    )
    assert kept_chunks == chunks
    assert kept_messages == messages


def test_fit_to_budget_drops_oldest_chunks_first():
    """Over budget: drops oldest chunks first, then oldest messages."""
    # Each chunk is 100 chars = 25 tokens
    chunk1 = _chunk("a" * 100, id_suffix="1")
    chunk2 = _chunk("b" * 100, id_suffix="2")
    chunk3 = _chunk("c" * 100, id_suffix="3")
    chunks = [chunk1, chunk2, chunk3]
    messages = [_msg("user", "x")]

    # Budget barely fits only chunk3
    kept_chunks, kept_messages = fit_to_budget(
        chunks, messages, budget=30
    )
    # Oldest chunks (1 and 2) should be dropped
    assert len(kept_chunks) == 1
    assert kept_chunks[0].id == "c3"
    assert kept_messages == messages


def test_fit_to_budget_drops_oldest_messages_after_chunks_empty():
    """When chunks are empty, drops oldest messages (but keeps the last)."""
    chunks = []
    messages = [
        _msg("user", "m1" * 200),   # 100 tokens
        _msg("assistant", "m2" * 200),
        _msg("user", "m3" * 200),
    ]
    # Budget is small: only room for the final message (~100 tokens)
    kept_chunks, kept_messages = fit_to_budget(
        chunks, messages, budget=120
    )
    assert kept_chunks == []
    # Should keep only the last message
    assert len(kept_messages) == 1
    assert kept_messages[0]["content"] == "m3" * 200


def test_fit_to_budget_keeps_final_message_never_dropped():
    """The final message is never dropped, even if it alone exceeds budget."""
    chunks = []
    messages = [
        _msg("user", "old" * 10000),  # Very large first message
        _msg("assistant", "response"),
        _msg("user", "x" * 50000),  # Final message, very large
    ]
    # Tiny budget
    kept_chunks, kept_messages = fit_to_budget(
        chunks, messages, budget=10
    )
    assert kept_chunks == []
    # Must keep the final message
    assert len(kept_messages) == 1
    assert kept_messages[-1]["content"] == "x" * 50000


def test_fit_to_budget_drops_chunks_then_messages():
    """Drops oldest chunks first, then oldest messages if still over."""
    chunk1 = _chunk("a" * 100, id_suffix="1")
    chunk2 = _chunk("b" * 100, id_suffix="2")
    messages = [
        _msg("user", "m1" * 100),
        _msg("assistant", "m2"),
        _msg("user", "m3"),
    ]
    # Budget: ~20 tokens. Chunks are ~25 tokens each, first message ~25.
    # Should drop both chunks, then the oldest message.
    kept_chunks, kept_messages = fit_to_budget(
        [chunk1, chunk2], messages, budget=20
    )
    assert kept_chunks == []
    assert len(kept_messages) == 2
    # Oldest message dropped, kept the last two
    assert kept_messages[0]["content"] == "m2"
    assert kept_messages[1]["content"] == "m3"


def test_fit_to_budget_does_not_mutate_input():
    """fit_to_budget works on copies; inputs are unchanged."""
    chunks = [_chunk("text", id_suffix="1")]
    messages = [_msg("user", "hello")]
    chunks_before = list(chunks)
    messages_before = list(messages)

    fit_to_budget(chunks, messages, budget=5)

    assert chunks == chunks_before
    assert messages == messages_before


def test_fit_to_budget_custom_text_of():
    """fit_to_budget accepts custom text_of for non-chunk objects."""
    # Use plain dicts with a 'body' key instead of chunks
    items = [
        {"body": "a" * 100, "id": "1"},
        {"body": "b" * 100, "id": "2"},
    ]
    messages = [_msg("user", "x")]

    kept_items, kept_messages = fit_to_budget(
        items, messages, budget=30, text_of=lambda x: x["body"]
    )
    # Should drop the oldest item
    assert len(kept_items) == 1
    assert kept_items[0]["id"] == "2"
