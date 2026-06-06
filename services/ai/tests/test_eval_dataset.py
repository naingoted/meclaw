"""Pydantic-validated interview eval dataset loader (spec §6.1)."""

import textwrap

import pytest

from app.eval.dataset import EvalCase, load_dataset


def _write(tmp_path, text: str):
    path = tmp_path / "set.yaml"
    path.write_text(textwrap.dedent(text))
    return path


def test_loads_valid_minimal_case(tmp_path):
    path = _write(tmp_path, """
        - id: tech-stack-primary
          category: technical
          question: "What's your primary backend stack?"
          expected_behavior: answer
    """)
    cases = load_dataset(path)
    assert len(cases) == 1
    c = cases[0]
    assert isinstance(c, EvalCase)
    assert c.id == "tech-stack-primary"
    assert c.category == "technical"
    assert c.expected_behavior == "answer"
    assert c.reference_answer is None
    assert c.must_include == []


def test_loads_optional_fields(tmp_path):
    path = _write(tmp_path, """
        - id: tech-stack
          category: technical
          question: "stack?"
          expected_behavior: answer
          reference_answer: "TypeScript and Postgres."
          must_include: ["TypeScript", "Postgres"]
          notes: "core competency"
    """)
    c = load_dataset(path)[0]
    assert c.reference_answer == "TypeScript and Postgres."
    assert c.must_include == ["TypeScript", "Postgres"]
    assert c.notes == "core competency"


def test_rejects_unknown_category(tmp_path):
    path = _write(tmp_path, """
        - id: bad
          category: small_talk
          question: "hi"
          expected_behavior: answer
    """)
    with pytest.raises(ValueError):
        load_dataset(path)


def test_rejects_unknown_expected_behavior(tmp_path):
    path = _write(tmp_path, """
        - id: bad
          category: technical
          question: "q"
          expected_behavior: deflect
    """)
    with pytest.raises(ValueError):
        load_dataset(path)


def test_rejects_missing_required_field(tmp_path):
    path = _write(tmp_path, """
        - id: bad
          category: technical
          expected_behavior: answer
    """)
    with pytest.raises(ValueError):
        load_dataset(path)


def test_rejects_duplicate_ids(tmp_path):
    path = _write(tmp_path, """
        - id: dup
          category: technical
          question: "a"
          expected_behavior: answer
        - id: dup
          category: logistics
          question: "b"
          expected_behavior: defer
    """)
    with pytest.raises(ValueError, match="duplicate"):
        load_dataset(path)
