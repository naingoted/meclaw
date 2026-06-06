"""Scoring (spec §7.2). Reference-free metrics always run; reference-based metrics
run only when the case has a `reference_answer`. `defer` cases are scored by the
custom defer-accuracy check (reference-free) and skip Ragas correctness entirely.

The Ragas call is injected (`ragas_score_fn`) so unit tests run without a judge.
The live wiring (LangchainLLMWrapper(get_chat_model(...)) + Ollama embeddings)
lives in `build_ragas_score_fn`, exercised by the live smoke run, not unit tests."""

from __future__ import annotations

from typing import Callable

from app.answer_gap import is_missing_fact_answer
from app.eval.collect import CollectResult
from app.eval.dataset import EvalCase
from app.lead import _OFFER_MARKERS  # noqa: F401

# (question, answer, contexts, reference) -> {metric_name: score}
RagasScoreFn = Callable[..., dict]


def exact_match(answer: str, must_include: list[str]) -> bool:
    """All required facts present in the answer (case-insensitive substring)."""
    lowered = answer.lower()
    return all(fact.lower() in lowered for fact in must_include)


def defer_accuracy(answer: str) -> bool:
    """A defer case passes when the bot offered to capture contact (any known
    offer marker) AND did not fabricate. We treat an explicit lead offer or a
    missing-fact admission as a valid deferral; absence of both = the bot
    answered as if it knew (fail)."""
    offered = any(marker in answer for marker in _OFFER_MARKERS.values())
    admitted = is_missing_fact_answer(answer)
    return offered or admitted


def score_case(
    case: EvalCase,
    result: CollectResult,
    *,
    ragas_score_fn: RagasScoreFn,
) -> dict:
    """Return a flat scores dict for one case, including a boolean `passed`."""
    scores: dict = {}

    if case.expected_behavior == "defer":
        scores["defer_accuracy"] = defer_accuracy(result.answer)
        scores["passed"] = scores["defer_accuracy"]
        return scores

    # answer / clarify cases.
    scores["exact_match"] = exact_match(result.answer, case.must_include)

    ragas = ragas_score_fn(
        question=case.question,
        answer=result.answer,
        contexts=result.contexts,
        reference=case.reference_answer,
    )
    scores.update(ragas)

    # Pass = required facts present + faithfulness not failing (when measured).
    faithfulness_ok = scores.get("faithfulness", 1.0) >= 0.5
    scores["passed"] = bool(scores["exact_match"]) and faithfulness_ok
    return scores


def build_ragas_score_fn() -> RagasScoreFn:
    """Live Ragas scorer: qwen judge via the proven get_chat_model seam + Ollama
    embeddings (spec §7.2). Imported lazily so unit tests never pull ragas into
    the hot import path. Exercised by the live smoke run, not CI."""
    from langchain_ollama import OllamaEmbeddings
    from ragas import evaluate
    from ragas.dataset_schema import EvaluationDataset, SingleTurnSample
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper
    from ragas.metrics import (
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
        Faithfulness,
        FactualCorrectness,
    )

    from app import config
    from app.provider import get_chat_model

    judge = LangchainLLMWrapper(get_chat_model(config.TRIAGE_MODEL, streaming=False, thinking=False))
    embeddings = LangchainEmbeddingsWrapper(
        OllamaEmbeddings(base_url=config.OLLAMA_BASE_URL, model=config.OLLAMA_EMBED_MODEL)
    )

    def score(*, question, answer, contexts, reference) -> dict:
        sample = SingleTurnSample(
            user_input=question,
            response=answer,
            retrieved_contexts=contexts or [""],
            reference=reference,
        )
        metrics = [Faithfulness(), AnswerRelevancy(), ContextPrecision()]
        if reference is not None:
            metrics += [ContextRecall(), FactualCorrectness()]
        report = evaluate(
            dataset=EvaluationDataset(samples=[sample]),
            metrics=metrics,
            llm=judge,
            embeddings=embeddings,
        )
        # ragas returns a result whose .to_pandas() has one row; reduce to a dict
        row = report.to_pandas().iloc[0].to_dict()
        return {k: float(v) for k, v in row.items() if isinstance(v, (int, float))}

    return score
