"""Tests for the streaming runner — drives triage → retrieval/tool → live draft
token streaming, applying the groundedness gate BEFORE drafting so we never
stream tokens we'd have to retract."""

from app.graph.nodes import TriageResult
from app.lead import SOFT_OFFER, CONNECT_OFFER, ESCALATED_OFFER, NEUTRAL_FALLBACK, confirm
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
    assert SOFT_OFFER in body          # blunt fallback replaced by a capture offer
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
        yield "Reach Thet at naingoted@gmail.com"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "how do I reach him?"}],
            triage_fn=_triage("contact", 0.95),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "naingoted@gmail.com"},
        )
    )

    assert "naingoted@gmail.com" in captured["context"]
    assert '"route":"contact"' in body
    assert '"delta":"Reach Thet at naingoted@gmail.com"' in body


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
            contact_fn=lambda: {"email": "naingoted@gmail.com"},
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


def test_contact_in_message_captures_lead_and_confirms():
    drafted = {"called": False}

    def draft_stream(system, messages, context):
        drafted["called"] = True
        yield "x"

    history = [
        {"role": "user", "content": "what's his salary?"},
        {"role": "assistant", "content": SOFT_OFFER},
        {"role": "user", "content": "sure, jane@acme.com"},
    ]
    body = _collect(
        run_stream(
            history,
            triage_fn=_triage("general", 0.9),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )

    assert drafted["called"] is False
    assert "jane@acme.com" in body              # confirmation echoes the contact
    assert "make sure Thet follows up" in body
    assert '"lead":{' in body                   # lead object rides in metadata
    assert '"email":"jane@acme.com"' in body
    assert '"trigger":"edge_case"' in body      # mapped from the prior SOFT_OFFER
    assert '"triggerQuestion":"what\'s his salary?"' in body


def test_low_confidence_without_question_offers_capture():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "??"}],
            triage_fn=_triage("general", 0.2, question=None),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )
    assert SOFT_OFFER in body
    assert '"route":"respond"' in body


def test_repeated_dead_end_escalates_offer():
    history = [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": SOFT_OFFER},
        {"role": "user", "content": "another obscure q"},
    ]
    body = _collect(
        run_stream(
            history,
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult([], []),  # no chunks → fallback
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )
    assert ESCALATED_OFFER in body


def test_scheduler_appends_connect_offer():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "can I book a call?"}],
            triage_fn=_triage("scheduler", 0.95),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["Book here: cal.com/x"]),
            schedule_fn=lambda: {"url": "https://cal.com/x"},
            contact_fn=lambda: {},
        )
    )
    assert "Book here" in body
    assert CONNECT_OFFER in body


def test_offer_suppressed_after_prior_confirm():
    history = [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": confirm({"email": "j@a.com"})},
        {"role": "user", "content": "yet another obscure q"},
    ]
    body = _collect(
        run_stream(
            history,
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )
    assert NEUTRAL_FALLBACK in body
    assert SOFT_OFFER not in body
    assert ESCALATED_OFFER not in body


def test_persona_prefix_prepended_to_knowledge_system():
    captured = {}

    def retrieve(query):
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def draft_stream(system, messages, context):
        captured["system"] = system
        yield "Python."

    persona = "You are an AI assistant."
    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            persona_prefix=persona,
        )
    )

    assert captured["system"].startswith(f"{persona}\n\n")
    assert '"delta":"Python."' in body


def test_persona_prefix_empty_string_does_not_prepend():
    captured = {}

    def retrieve(query):
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def draft_stream(system, messages, context):
        captured["system"] = system
        yield "Python."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            persona_prefix="",
        )
    )

    # System should NOT start with "\n\n" (no prefix applied)
    assert not captured["system"].startswith("\n\n")
    assert '"delta":"Python."' in body


def test_metadata_includes_corpus_version():
    def retrieve(query):
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def draft_stream(system, messages, context):
        yield "ok"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            corpus_version_fn=lambda: 7,
        )
    )
    assert '"corpus_version":7' in body


def _embed_stub(_query):
    return [0.0, 0.0, 0.0]


def _assign_stub(cluster_id="cluster-x"):
    def _fn(_embedding, _query):
        return cluster_id
    return _fn


def test_floor_below_threshold_records_floor_miss():
    captured = {"assigned": None}

    def assign(_embedding, query):
        captured["assigned"] = query
        return "cluster-floor"

    def retrieve(_query):
        # one weak chunk, score below the floor
        return RetrievalResult(
            chunks=[RetrievedChunk(id="d#0", source="a.md", title="A", text="weak", ordinal=0, score=0.2)],
            sources=[{"source": "a.md", "title": "A", "score": 0.2}],
        )

    def draft_stream(system, messages, context):
        raise AssertionError("must not draft an ungrounded answer")

    body = _collect(
        run_stream(
            [{"role": "user", "content": "obscure?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            embed_fn=_embed_stub,
            assign_cluster_fn=assign,
        )
    )

    assert '"miss":{' in body
    assert '"reason":"floor"' in body
    assert '"topScore":0.2' in body
    assert '"clusterId":"cluster-floor"' in body
    assert captured["assigned"] == "obscure?"
    assert body.rstrip().endswith("[DONE]")


def test_zero_chunks_records_fallback_miss_with_null_score():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(["nope"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            embed_fn=_embed_stub,
            assign_cluster_fn=_assign_stub("cluster-fb"),
        )
    )
    assert '"reason":"fallback"' in body
    assert '"topScore":null' in body
    assert '"clusterId":"cluster-fb"' in body


def test_low_confidence_records_clarify_miss():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "that one"}],
            triage_fn=_triage("project", 0.2, question="Which project?"),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            embed_fn=_embed_stub,
            assign_cluster_fn=_assign_stub("cluster-clar"),
        )
    )
    assert '"reason":"clarify"' in body
    assert '"clusterId":"cluster-clar"' in body
    assert "Which project?" in body


def test_grounded_answer_carries_null_miss():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(
                chunks=[RetrievedChunk(id="d#0", source="a.md", title="A", text="Python", ordinal=0, score=0.9)],
                sources=[{"source": "a.md", "title": "A", "score": 0.9}],
            ),
            draft_stream_fn=lambda s, m, c: iter(["Python."]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            embed_fn=_embed_stub,
            assign_cluster_fn=_assign_stub("nope"),
        )
    )
    assert '"miss":null' in body
    assert '"delta":"Python."' in body


def test_clustering_failure_emits_null_miss_and_still_streams():
    def boom_embed(_q):
        raise RuntimeError("ollama down")

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            embed_fn=boom_embed,
            assign_cluster_fn=_assign_stub("never"),
        )
    )
    assert '"miss":null' in body          # clustering failed → no miss recorded
    assert body.rstrip().endswith("[DONE]")


def test_grounded_answer_admitting_missing_fact_records_answer_gap():
    captured = {"assigned": None}

    def assign(_embedding, query):
        captured["assigned"] = query
        return "cluster-ag"

    def retrieve(_query):
        # retrieval passes the floor — a nearby chunk scores high…
        return RetrievalResult(
            chunks=[RetrievedChunk(id="d#0", source="about.md", title="About", text="Thet likes coffee.", ordinal=0, score=0.7)],
            sources=[{"source": "about.md", "title": "About", "score": 0.7}],
        )

    def draft_stream(system, messages, context):
        # …but the model admits the actual fact isn't present.
        yield "The provided context "
        yield "does not explicitly state his favorite language."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "fav language?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            embed_fn=_embed_stub,
            assign_cluster_fn=assign,
        )
    )

    assert '"reason":"answer_gap"' in body
    assert '"clusterId":"cluster-ag"' in body
    assert '"topScore":0.7' in body
    assert captured["assigned"] == "fav language?"
    # the answer still streamed (we don't retract)
    assert '"does not explicitly state' in body
    assert body.rstrip().endswith("[DONE]")


def test_tool_route_does_not_run_answer_gap_detection():
    # contact route returns a missing-fact-looking draft, but tool routes are
    # tool-owned → no answer_gap miss.
    body = _collect(
        run_stream(
            [{"role": "user", "content": "his number?"}],
            triage_fn=_triage("contact", 0.9),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["I don't know his phone number."]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
            score_floor=0.35,
            embed_fn=_embed_stub,
            assign_cluster_fn=_assign_stub("should-not-be-used"),
        )
    )
    assert '"miss":null' in body
    assert '"reason":"answer_gap"' not in body
