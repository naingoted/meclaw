from datetime import datetime, timezone

from app.corpus import (
    corpus_state,
    corpus_version,
    corpus_fulltext,
    _VERSION_SQL,
    _DOCS_SQL,
    _CHUNKS_SQL,
    _LAST_SQL,
    _FULLTEXT_SQL,
)


def _fake_fetch(results):
    """Map each SQL string to its scalar result (order-independent)."""

    def fetch(sql, params=None):
        return results[sql]

    return fetch


def test_corpus_state_maps_contract_fields():
    fetch = _fake_fetch(
        {
            _VERSION_SQL: 2,
            _DOCS_SQL: 1,
            _CHUNKS_SQL: 19,
            _LAST_SQL: datetime(2026, 6, 2, 18, 0, 0, tzinfo=timezone.utc),
        }
    )
    state = corpus_state(fetch_one=fetch)
    assert state["version"] == 2
    assert state["documents"] == 1
    assert state["chunks"] == 19
    # real psycopg returns a datetime; verify the .isoformat() conversion runs
    assert state["lastIngestedAt"] == "2026-06-02T18:00:00+00:00"
    assert isinstance(state["embedModel"], str)


def test_corpus_version_returns_int():
    assert corpus_version(fetch_one=_fake_fetch({_VERSION_SQL: 7})) == 7


def test_corpus_version_returns_none_on_error():
    def boom(sql, params=None):
        raise RuntimeError("db down")

    assert corpus_version(fetch_one=boom) is None


def test_corpus_fulltext_concats_and_estimates_tokens():
    def fetch_all(sql, params=None):
        assert sql == _FULLTEXT_SQL
        return [("alpha beta",), ("gamma",)]

    text, tokens = corpus_fulltext(fetch_all=fetch_all)
    assert text == "alpha beta\n\ngamma"
    # token estimate ~ chars/4 → len("alpha beta\n\ngamma") // 4
    assert tokens == len("alpha beta\n\ngamma") // 4


def test_corpus_fulltext_degrades_to_empty_on_error():
    def boom(sql, params=None):
        raise RuntimeError("db down")

    assert corpus_fulltext(fetch_all=boom) == ("", 0)
