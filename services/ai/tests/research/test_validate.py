from app.research.validate import make_validator


def _judge(score):
    class _Model:
        def invoke(self, messages):
            class _R:
                content = '{"score": %s, "reason": "ok"}' % score

            return _R()

    return _Model()


def _validate(note, *, judge, min_chars=40, threshold=0.6, score_floor=0.35):
    return make_validator(
        judge,
        min_chars=min_chars,
        judge_threshold=threshold,
        corpus_score_floor=score_floor,
    )({"source": "owner_corpus", "query": "q"}, note)


def test_empty_note_is_bad_without_calling_judge():
    judge = _judge(0.9)  # would pass if reached
    out = _validate({"text": "  ", "sources": [], "tool_calls": 0}, judge=judge)
    assert out["verdict"] == "bad"
    assert out["stage"] == "heuristic"


def test_too_short_note_is_bad():
    out = _validate({"text": "tiny", "sources": [], "tool_calls": 1}, judge=_judge(0.9))
    assert out["verdict"] == "bad"


def test_corpus_below_score_floor_is_bad():
    note = {
        "text": "x" * 80,
        "sources": [{"source": "a.md", "score": 0.1}],
        "tool_calls": 1,
    }
    out = _validate(note, judge=_judge(0.9))
    assert out["verdict"] == "bad"
    assert out["stage"] == "heuristic"


def test_passes_gate_then_judge_below_threshold_is_bad():
    note = {
        "text": "x" * 80,
        "sources": [{"source": "a.md", "score": 0.7}],
        "tool_calls": 1,
    }
    out = _validate(note, judge=_judge(0.3))
    assert out["verdict"] == "bad"
    assert out["stage"] == "judge"
    assert out["score"] == 0.3


def test_passes_gate_and_judge_is_good():
    note = {
        "text": "x" * 80,
        "sources": [{"source": "a.md", "score": 0.7}],
        "tool_calls": 1,
    }
    out = _validate(note, judge=_judge(0.8))
    assert out["verdict"] == "good"
    assert out["score"] == 0.8
