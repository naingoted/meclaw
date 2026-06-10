"""Tests for the resolved-gap fast-path lookup. DB ops are injected — no live
Postgres, mirroring test_gaps.py."""

from app.gap_match import (
    _SEARCH_SQL,
    ResolvedAnswer,
    find_resolved_answer,
    strip_title_heading,
)


def _row(**overrides):
    row = {
        "cluster_id": "cl-1",
        "document_id": "doc-1",
        "distance": 0.05,
        "title": "Are you sure?",
        "body": "# Are you sure?\n\nYes, completely sure.",
    }
    row.update(overrides)
    return row


def test_returns_resolved_answer_with_title_heading_stripped():
    result = find_resolved_answer([0.0], search_fn=lambda emb: _row())
    assert isinstance(result, ResolvedAnswer)
    assert result.answer == "Yes, completely sure."
    assert result.document_id == "doc-1"
    assert result.cluster_id == "cl-1"
    assert result.title == "Are you sure?"
    assert result.distance == 0.05


def test_no_resolved_cluster_returns_none():
    assert find_resolved_answer([0.0], search_fn=lambda emb: None) is None


def test_dangling_cluster_missing_document_returns_none(caplog):
    # LEFT JOIN found no documents row → document columns are NULL.
    row = _row(document_id=None, title=None, body=None)
    with caplog.at_level("WARNING"):
        assert find_resolved_answer([0.0], search_fn=lambda emb: row) is None
    assert "dangling" in caplog.text


def test_empty_body_after_strip_returns_none():
    row = _row(body="# Are you sure?\n\n   \n")
    assert find_resolved_answer([0.0], search_fn=lambda emb: row) is None


def test_search_fn_raising_propagates():
    # Error handling (fall through to triage) lives in streaming, not here.
    def boom(_emb):
        raise RuntimeError("db down")

    try:
        find_resolved_answer([0.0], search_fn=boom)
        raise AssertionError("expected RuntimeError")
    except RuntimeError:
        pass


def test_strip_title_heading_only_when_duplicate():
    assert strip_title_heading("# Q?\n\nBody.", "Q?") == "Body."
    assert (
        strip_title_heading("## Q?\nBody.", "q?") == "Body."
    )  # case/level-insensitive
    assert strip_title_heading("# Other\n\nBody.", "Q?") == "# Other\n\nBody."
    assert strip_title_heading("Plain body.", "Q?") == "Plain body."
    assert strip_title_heading("", "Q?") == ""


def test_search_sql_shape():
    assert "status = 'resolved'" in _SEARCH_SQL
    assert '"resolvedDocumentId"' in _SEARCH_SQL
    assert "centroid <=>" in _SEARCH_SQL
    assert "LEFT JOIN documents" in _SEARCH_SQL
    assert "LIMIT 1" in _SEARCH_SQL
