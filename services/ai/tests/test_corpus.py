from app.corpus import corpus_state, corpus_version


def _fake_fetch(rows):
    # returns scalar query results in call order: version, documents, chunks, last
    calls = iter(rows)

    def fetch(sql, params=None):
        return next(calls)

    return fetch


def test_corpus_state_maps_contract_fields():
    fetch = _fake_fetch([2, 1, 19, "2026-06-02T18:00:00+00:00"])
    state = corpus_state(fetch_one=fetch)
    assert state["version"] == 2
    assert state["documents"] == 1
    assert state["chunks"] == 19
    assert state["lastIngestedAt"] == "2026-06-02T18:00:00+00:00"
    assert isinstance(state["embedModel"], str)


def test_corpus_version_returns_int():
    assert corpus_version(fetch_one=_fake_fetch([7])) == 7


def test_corpus_version_returns_none_on_error():
    def boom(sql, params=None):
        raise RuntimeError("db down")
    assert corpus_version(fetch_one=boom) is None
