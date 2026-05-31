"""Tests for the streaming runner — drives triage → retrieval/tool → live draft
token streaming, applying the groundedness gate BEFORE drafting so we never
stream tokens we'd have to retract."""

from app.graph.nodes import FALLBACK_TEXT, TriageResult
from app.retriever import RetrievalResult, RetrievedChunk
from app.streaming import run_stream


def _chunk(text: str) -> RetrievedChunk:
    return RetrievedChunk(
        id="d#0", source="about.md", title="About", text=text, ordinal=0, score=0.8
    )


def _collect(gen) -> str:
    return "".join(gen)


def _triage(intent: str, confidence: float, question=None):
    def _fn(messages):
        return TriageResult(
            intent=intent, confidence=confidence, clarifying_question=question
        )

    return _fn


def test_knowledge_path_streams_status_sources_and_deltas():
    captured = {}

    def retrieve(query):
        captured["query"] = query
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def draft_stream(system, messages, context):
        captured["system"] = system
        captured["context"] = context
        yield "Thet "
        yield "uses "
        yield "Python."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    # retrieval status announced before the answer streams
    assert '"type":"data-status"' in body
    assert '"stage":"retrieval"' in body
    # sources travel in the start/finish metadata
    assert '"route":"tech"' in body
    assert '"source":"about.md"' in body
    # the answer arrives as real token deltas, not one blob
    assert '"delta":"Thet "' in body
    assert '"delta":"uses "' in body
    assert '"delta":"Python."' in body
    assert body.rstrip().endswith("[DONE]")
    # the draft was grounded in the retrieved context
    assert "Thet uses Python." in captured["context"]
    assert captured["query"] == "what's the stack?"


def test_empty_retrieval_emits_fallback_without_drafting():
    drafted = {"called": False}

    def retrieve(query):
        return RetrievalResult(chunks=[], sources=[])

    def draft_stream(system, messages, context):
        drafted["called"] = True
        yield "should not happen"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert drafted["called"] is False  # groundedness gate fires before drafting
    assert FALLBACK_TEXT in body
    assert body.rstrip().endswith("[DONE]")


def test_low_confidence_streams_clarifying_question():
    drafted = {"called": False}

    def draft_stream(system, messages, context):
        drafted["called"] = True
        yield "x"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "that one"}],
            triage_fn=_triage("project", 0.2, question="Which project?"),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert drafted["called"] is False
    assert "Which project?" in body
    assert '"route":"respond"' in body


def test_contact_intent_drafts_from_tool_context():
    captured = {}

    def draft_stream(system, messages, context):
        captured["context"] = context
        yield "Reach Thet at thetnaing@incube8.sg"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "how do I reach him?"}],
            triage_fn=_triage("contact", 0.95),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "thetnaing@incube8.sg"},
        )
    )

    assert "thetnaing@incube8.sg" in captured["context"]
    assert '"route":"contact"' in body
    assert '"delta":"Reach Thet at thetnaing@incube8.sg"' in body


def test_knowledge_path_metadata_carries_ordered_steps():
    def retrieve(query):
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def draft_stream(system, messages, context):
        yield "Python."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert (
        '"steps":["Routing your question…",'
        '"Searching knowledge base…","Writing the answer…"]'
    ) in body


def test_contact_path_metadata_carries_ordered_steps():
    def draft_stream(system, messages, context):
        yield "Email him."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "how do I reach him?"}],
            triage_fn=_triage("contact", 0.95),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "thetnaing@incube8.sg"},
        )
    )

    assert (
        '"steps":["Routing your question…",'
        '"Pulling up contact details…","Writing the answer…"]'
    ) in body


def test_scheduler_path_metadata_carries_ordered_steps():
    def draft_stream(system, messages, context):
        yield "Book here."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "can I book a call?"}],
            triage_fn=_triage("scheduler", 0.95),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {"url": "https://cal.com/thet"},
            contact_fn=lambda: {},
        )
    )

    assert (
        '"steps":["Routing your question…",'
        '"Pulling up booking details…","Writing the answer…"]'
    ) in body


def test_clarify_path_metadata_carries_single_step():
    def draft_stream(system, messages, context):
        yield "x"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "that one"}],
            triage_fn=_triage("project", 0.2, question="Which project?"),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert '"steps":["Routing your question…"]' in body


def test_fallback_path_metadata_carries_routing_and_search_steps():
    def draft_stream(system, messages, context):
        yield "should not happen"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert (
        '"steps":["Routing your question…","Searching knowledge base…"]'
    ) in body
