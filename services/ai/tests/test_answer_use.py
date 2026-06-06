"""Token-overlap heuristic for `answer_used` (prod-telemetry signal, NOT the eval
verdict — Ragas faithfulness is authoritative offline). Pure, no I/O, no LLM."""

from app.answer_use import compute_answer_used


def test_full_overlap_is_used():
    # Every draft token appears in the context.
    assert compute_answer_used("Thet uses Python", "Thet uses Python daily", 0.5) is True


def test_no_overlap_is_not_used():
    assert compute_answer_used("totally unrelated words", "Thet uses Python", 0.5) is False


def test_empty_draft_is_not_used():
    assert compute_answer_used("", "anything", 0.5) is False


def test_empty_context_is_not_used():
    assert compute_answer_used("Thet uses Python", "", 0.5) is False


def test_ratio_is_overlap_over_draft_token_count():
    # 2 of 4 distinct draft tokens ("python", "rust") appear in context -> ratio 0.5.
    draft = "python rust java go"
    context = "we use python and rust here"
    assert compute_answer_used(draft, context, 0.5) is True   # 0.5 >= 0.5
    assert compute_answer_used(draft, context, 0.51) is False  # 0.5 < 0.51


def test_is_case_insensitive_and_ignores_punctuation():
    assert compute_answer_used("Python!", "i love python.", 0.5) is True
