"""History cap (caching spec lever 1): rolling message window + token budget."""

from unittest.mock import patch

from app.graph.nodes import TriageResult
from app.history import cap_history, estimate_tokens
from app.lead import (
    has_prior_confirm,
    most_recent_offer_trigger,
    prior_offer_made,
    prior_user_question,
)
from app.retriever import RetrievalResult
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
