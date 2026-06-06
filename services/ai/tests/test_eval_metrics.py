"""Custom scorers + per-case metric orchestration (Ragas injected)."""

from app.eval.collect import CollectResult
from app.eval.dataset import EvalCase
from app.eval.metrics import defer_accuracy, exact_match, score_case


def _case(**kw) -> EvalCase:
    base = dict(id="c", category="technical", question="q", expected_behavior="answer")
    base.update(kw)
    return EvalCase(**base)


def test_exact_match_all_present_passes():
    assert exact_match("I use TypeScript and Postgres daily", ["TypeScript", "Postgres"]) is True


def test_exact_match_is_case_insensitive():
    assert exact_match("i use typescript", ["TypeScript"]) is True


def test_exact_match_missing_fact_fails():
    assert exact_match("I use Go", ["TypeScript"]) is False


def test_exact_match_empty_requirements_passes():
    assert exact_match("anything", []) is True


def test_defer_accuracy_passes_when_offer_made():
    # SOFT_OFFER text contains a known offer marker.
    from app.lead import SOFT_OFFER
    assert defer_accuracy(SOFT_OFFER) is True


def test_defer_accuracy_fails_when_bot_fabricates_an_answer():
    assert defer_accuracy("Your base salary is $200,000.") is False


def test_score_case_runs_only_reference_free_metrics_without_reference():
    case = _case(expected_behavior="answer", must_include=["TypeScript"])
    result = CollectResult(answer="I use TypeScript.", contexts=["Thet uses TypeScript."], retrieval={})

    calls = {}

    def fake_ragas(*, question, answer, contexts, reference):
        calls["reference"] = reference
        # reference-free metrics only when reference is None
        return {"faithfulness": 0.9, "answer_relevancy": 0.8}

    scored = score_case(case, result, ragas_score_fn=fake_ragas)
    assert scored["exact_match"] is True
    assert scored["faithfulness"] == 0.9
    assert "factual_correctness" not in scored  # reference-based, skipped
    assert calls["reference"] is None


def test_score_case_includes_reference_metrics_when_reference_present():
    case = _case(expected_behavior="answer", reference_answer="I use TypeScript.")
    result = CollectResult(answer="I use TypeScript.", contexts=["ctx"], retrieval={})

    def fake_ragas(*, question, answer, contexts, reference):
        scores = {"faithfulness": 0.9, "answer_relevancy": 0.8}
        if reference is not None:
            scores["factual_correctness"] = 0.95
            scores["context_recall"] = 0.7
        return scores

    scored = score_case(case, result, ragas_score_fn=fake_ragas)
    assert scored["factual_correctness"] == 0.95
    assert scored["context_recall"] == 0.7


def test_score_case_defer_uses_defer_accuracy_not_ragas_correctness():
    from app.lead import SOFT_OFFER
    case = _case(expected_behavior="defer")
    result = CollectResult(answer=SOFT_OFFER, contexts=[], retrieval=None)

    def fake_ragas(**kw):
        raise AssertionError("ragas must not run for defer cases")

    scored = score_case(case, result, ragas_score_fn=fake_ragas)
    assert scored["defer_accuracy"] is True
    assert scored["passed"] is True
