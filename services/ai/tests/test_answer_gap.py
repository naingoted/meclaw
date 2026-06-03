"""The answer-gap matcher must catch explicit missing-fact phrasing in a draft
while leaving normal grounded answers alone (conservative — false positives turn
good answers into gaps)."""

import pytest

from app.answer_gap import is_missing_fact_answer


@pytest.mark.parametrize(
    "text",
    [
        "The provided context does not explicitly state his favorite language.",
        "That's not explicitly stated in what I have.",
        "I don't know his phone number.",
        "I'm not certain about that.",
        "That detail is not in the provided context.",
        "The notes don't include that.",
        "It isn't mentioned anywhere in his materials.",
    ],
)
def test_flags_explicit_missing_fact(text):
    assert is_missing_fact_answer(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "Thet uses Python, TypeScript, and Rust.",
        "He built meclaw, a personal AI-twin chatbot.",
        "You can reach him by email at the address on his resume.",
        "",
        "His favorite editor is Neovim.",
    ],
)
def test_does_not_flag_grounded_answers(text):
    assert is_missing_fact_answer(text) is False
