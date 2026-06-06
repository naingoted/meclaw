"""Collect mode parses a real run_stream's SSE into a scored-case input."""

from app.eval.collect import CollectResult, collect_case
from app.graph.nodes import TriageResult
from app.retriever import RetrievalResult, RetrievedChunk
from app.streaming import run_stream


def _make_runner(*, chunks, draft_tokens, intent="tech", confidence=0.9):
    def runner(messages):
        return run_stream(
            messages,
            triage_fn=lambda m: TriageResult(
                intent=intent, confidence=confidence, clarifying_question=None
            ),
            retriever_retrieve=lambda q: RetrievalResult(
                chunks=chunks,
                sources=[{"source": c.source, "title": c.title, "score": c.score} for c in chunks],
            ),
            draft_stream_fn=lambda s, m, c: iter(draft_tokens),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_threshold=0.3,
            answer_use_threshold=0.3,
        )
    return runner


def test_collect_captures_answer_contexts_and_retrieval():
    chunks = [
        RetrievedChunk(
            id="about:0",
            source="about.md",
            title="About",
            text="Thet uses Python.",
            ordinal=0,
            score=0.62,
        ),
        RetrievedChunk(
            id="resume:3",
            source="resume.md",
            title="Resume",
            text="dropped low score",
            ordinal=3,
            score=0.10,
        ),
    ]
    runner = _make_runner(chunks=chunks, draft_tokens=["Thet ", "uses ", "Python."])

    # run.py wires this map from the real retriever's returned chunks (Task 16);
    # the runner builds context from the same source, so the texts match by id.
    text_by_id = {"about:0": "Thet uses Python.", "resume:3": "dropped low score"}
    result = collect_case(runner, "what's the stack?", chunk_text_by_id=text_by_id)

    assert isinstance(result, CollectResult)
    assert result.answer == "Thet uses Python."
    # only the kept (>=0.3) chunk's text becomes a Ragas context
    assert result.contexts == ["Thet uses Python."]
    assert result.retrieval["grounded"] is True
    assert result.retrieval["intent"] == "tech"


def test_collect_on_miss_has_empty_contexts_and_ungrounded_retrieval():
    chunks = [
        RetrievedChunk(
            id="about:0",
            source="about.md",
            title="About",
            text="weak",
            ordinal=0,
            score=0.05,
        )
    ]
    runner = _make_runner(chunks=chunks, draft_tokens=[])

    result = collect_case(runner, "obscure", chunk_text_by_id={"about:0": "weak"})
    assert result.contexts == []
    assert result.retrieval["grounded"] is False
