"""Tests for the streaming runner — drives triage → retrieval/tool → live draft
token streaming, applying the groundedness gate BEFORE drafting so we never
stream tokens we'd have to retract."""

import json

from app.gap_match import ResolvedAnswer
from app.graph.nodes import TriageResult
from app.lead import (
    SOFT_OFFER,
    CONNECT_OFFER,
    ESCALATED_OFFER,
    NEUTRAL_FALLBACK,
    confirm,
)
from app.retriever import RetrievalResult, RetrievedChunk
from app.streaming import run_stream


def _chunk(text: str) -> RetrievedChunk:
    return RetrievedChunk(
        id="d#0", source="about.md", title="About", text=text, ordinal=0, score=0.8
    )


def _collect(gen) -> str:
    return "".join(gen)


def _finish_metadata(body: str) -> dict:
    """Parse the SSE body and return the messageMetadata from the `finish` frame."""
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:") :].strip()
        if payload in ("", "[DONE]"):
            continue
        part = json.loads(payload)
        if part.get("type") == "finish":
            return part.get("messageMetadata", {})
    raise AssertionError("no finish frame found")


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
    assert SOFT_OFFER in body  # blunt fallback replaced by a capture offer
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


def test_low_confidence_still_answers_when_retrieval_grounds():
    """Regression: a resolved-gap answer must surface even when triage is unsure.

    Low triage confidence must NOT short-circuit before retrieval. A strongly
    grounded chunk (e.g. a curated answer the owner resolved a gap with) wins
    over the clarify gate — otherwise resolving a gap can never close it, since
    the clarify gate runs before retrieval and the curated doc lives in retrieval.
    """
    drafted = {"called": False}

    def retrieve(query):
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="document:abc:0",
                    source="document:abc",
                    title="East shit?",
                    text="# East shit? No no. you east shit.",
                    ordinal=0,
                    score=0.92,
                )
            ],
            sources=[{"source": "document:abc", "title": "East shit?", "score": 0.92}],
        )

    def draft_stream(system, messages, context):
        drafted["called"] = True
        drafted["context"] = context
        yield "No no. you east shit."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "East shit?"}],
            triage_fn=_triage("general", 0.1, question="Could you clarify?"),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
        )
    )

    assert drafted["called"] is True  # answered from retrieval, not clarified away
    assert "Could you clarify?" not in body
    assert '"delta":"No no. you east shit."' in body
    assert "east shit" in drafted["context"].lower()
    assert _finish_metadata(body)["miss"] is None


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


def test_clarify_path_carries_routing_and_search_steps():
    # A low-confidence knowledge query now retrieves BEFORE clarifying — retrieval
    # gets first crack so a grounded curated answer can win. With empty retrieval
    # it falls through to the clarifying question, but the search step still ran.
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

    assert '"steps":["Routing your question…","Searching knowledge base…"]' in body
    assert "Which project?" in body


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

    assert ('"steps":["Routing your question…","Searching knowledge base…"]') in body


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
    assert "jane@acme.com" in body  # confirmation echoes the contact
    assert "make sure Thet follows up" in body
    assert '"lead":{' in body  # lead object rides in metadata
    assert '"email":"jane@acme.com"' in body
    assert '"trigger":"edge_case"' in body  # mapped from the prior SOFT_OFFER
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
            retriever_retrieve=lambda q: RetrievalResult(
                [], []
            ),  # no chunks → fallback
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
            chunks=[
                RetrievedChunk(
                    id="d#0",
                    source="a.md",
                    title="A",
                    text="weak",
                    ordinal=0,
                    score=0.2,
                )
            ],
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
                chunks=[
                    RetrievedChunk(
                        id="d#0",
                        source="a.md",
                        title="A",
                        text="Python",
                        ordinal=0,
                        score=0.9,
                    )
                ],
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
    assert '"miss":null' in body  # clustering failed → no miss recorded
    assert body.rstrip().endswith("[DONE]")


def test_score_threshold_drops_subthreshold_chunks_before_gate():
    captured = {}

    def retrieve(_query):
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="d#0",
                    source="a.md",
                    title="A",
                    text="STRONG",
                    ordinal=0,
                    score=0.9,
                ),
                RetrievedChunk(
                    id="d#1",
                    source="b.md",
                    title="B",
                    text="WEAK",
                    ordinal=1,
                    score=0.4,
                ),
            ],
            sources=[
                {"source": "a.md", "title": "A", "score": 0.9},
                {"source": "b.md", "title": "B", "score": 0.4},
            ],
        )

    def draft_stream(system, messages, context):
        captured["context"] = context
        yield "ok"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            score_threshold=0.5,  # drops the 0.4 chunk
        )
    )

    assert "STRONG" in captured["context"]
    assert "WEAK" not in captured["context"]  # filtered before context build
    # User-facing sources array only includes kept chunks
    meta = _finish_metadata(body)
    assert len(meta["sources"]) == 1
    assert meta["sources"][0]["source"] == "a.md"
    # But all chunks (kept + dropped) are in retrieval telemetry with kept flags
    retr = meta["retrieval"]
    by_id = {c["id"]: c for c in retr["chunks"]}
    assert by_id["d#0"]["kept"] is True
    assert by_id["d#1"]["kept"] is False


def test_score_threshold_filtering_can_trigger_fallback():
    drafted = {"called": False}

    def retrieve(_query):
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="d#0",
                    source="a.md",
                    title="A",
                    text="weak",
                    ordinal=0,
                    score=0.4,
                )
            ],
            sources=[{"source": "a.md", "title": "A", "score": 0.4}],
        )

    def draft_stream(system, messages, context):
        drafted["called"] = True
        yield "nope"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            score_threshold=0.5,  # removes the only chunk → no usable context
        )
    )
    assert drafted["called"] is False  # no draft when filtered chunks fail groundedness
    assert SOFT_OFFER in body  # fallback offer emitted


def test_tiny_corpus_stuffs_full_corpus_and_skips_retrieval():
    captured = {"retrieved": False}

    def retrieve(_query):
        captured["retrieved"] = True
        return RetrievalResult(chunks=[], sources=[])

    def draft_stream(system, messages, context):
        captured["context"] = context
        yield "ok"

    body = _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            tiny_corpus_threshold=10000,
            corpus_text_fn=lambda: ("THE WHOLE CORPUS", 5),  # 5 < 10000
        )
    )

    assert captured["retrieved"] is False  # retrieval skipped
    assert captured["context"] == "THE WHOLE CORPUS"
    assert '"stage":"retrieval"' in body
    assert body.rstrip().endswith("[DONE]")


def test_tiny_corpus_disabled_when_corpus_exceeds_threshold():
    captured = {"retrieved": False}

    def retrieve(_query):
        captured["retrieved"] = True
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="d#0", source="a.md", title="A", text="hit", ordinal=0, score=0.9
                )
            ],
            sources=[{"source": "a.md", "title": "A", "score": 0.9}],
        )

    _collect(
        run_stream(
            [{"role": "user", "content": "stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            tiny_corpus_threshold=3,
            corpus_text_fn=lambda: ("big corpus text", 100),  # 100 > 3
        )
    )
    assert captured["retrieved"] is True


def test_triage_confidence_param_gates_clarify():
    # confidence 0.6 passes the default 0.5 gate but fails a stricter 0.8 gate.
    body = _collect(
        run_stream(
            [{"role": "user", "content": "that one"}],
            triage_fn=_triage("project", 0.6, question="Which project?"),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            triage_confidence=0.8,
        )
    )
    assert "Which project?" in body
    assert '"route":"respond"' in body


def test_grounded_answer_admitting_missing_fact_records_answer_gap():
    captured = {"assigned": None}

    def assign(_embedding, query):
        captured["assigned"] = query
        return "cluster-ag"

    def retrieve(_query):
        # retrieval passes the floor — a nearby chunk scores high…
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="d#0",
                    source="about.md",
                    title="About",
                    text="Thet likes coffee.",
                    ordinal=0,
                    score=0.7,
                )
            ],
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


def test_grounded_path_attaches_retrieval_metadata():
    def retrieve(query):
        return RetrievalResult(
            chunks=[
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
                    text="unrelated text here",
                    ordinal=3,
                    score=0.10,
                ),
            ],
            sources=[{"source": "about.md", "title": "About", "score": 0.62}],
        )

    def draft_stream(system, messages, context):
        yield "Thet uses Python."

    body = _collect(
        run_stream(
            [{"role": "user", "content": "what's the stack?"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=draft_stream,
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_threshold=0.3,
            answer_use_threshold=0.3,
        )
    )

    retr = _finish_metadata(body)["retrieval"]
    assert retr["query"] == "what's the stack?"
    assert retr["intent"] == "tech"
    assert retr["grounded"] is True
    assert retr["stuffed"] is False
    assert retr["top_score"] == 0.62
    assert retr["answer_used"] is True  # draft overlaps the kept chunk text
    # both candidates listed; only the >=0.3 one is kept
    by_id = {c["id"]: c for c in retr["chunks"]}
    assert by_id["about:0"]["kept"] is True
    assert by_id["resume:3"]["kept"] is False
    assert by_id["about:0"]["score"] == 0.62


def test_fallback_miss_attaches_ungrounded_retrieval():
    # Top score below floor -> groundedness gate fires; retrieval still recorded.
    def retrieve(query):
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="about:0",
                    source="about.md",
                    title="About",
                    text="weak",
                    ordinal=0,
                    score=0.05,
                )
            ],
            sources=[],
        )

    body = _collect(
        run_stream(
            [{"role": "user", "content": "obscure question"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=lambda s, m, c: iter(()),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            score_threshold=0.0,
        )
    )
    retr = _finish_metadata(body)["retrieval"]
    assert retr["grounded"] is False
    assert retr["answer_used"] is False
    assert retr["chunks"][0]["id"] == "about:0"
    # kept (>= score_threshold 0.0) but below floor -> top_score recorded
    assert retr["top_score"] == 0.05


def test_zero_kept_miss_records_null_top_score():
    def retrieve(query):
        return RetrievalResult(
            chunks=[
                RetrievedChunk(
                    id="about:0",
                    source="about.md",
                    title="About",
                    text="x",
                    ordinal=0,
                    score=0.1,
                )
            ],
            sources=[],
        )

    body = _collect(
        run_stream(
            [{"role": "user", "content": "q"}],
            triage_fn=_triage("tech", 0.9),
            retriever_retrieve=retrieve,
            draft_stream_fn=lambda s, m, c: iter(()),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            score_floor=0.35,
            score_threshold=0.5,  # nothing survives -> kept empty
        )
    )
    retr = _finish_metadata(body)["retrieval"]
    assert retr["grounded"] is False
    assert retr["top_score"] is None
    assert retr["chunks"][0]["kept"] is False


def test_stuffed_path_attaches_stuffed_retrieval():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "q"}],
            triage_fn=_triage("general", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(["Full ", "corpus ", "answer."]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            corpus_text_fn=lambda: ("Full corpus answer text", 5),
            tiny_corpus_threshold=100,
            answer_use_threshold=0.3,
        )
    )
    retr = _finish_metadata(body)["retrieval"]
    assert retr["stuffed"] is True
    assert retr["grounded"] is True
    assert retr["top_score"] is None
    assert retr["chunks"] == []
    assert retr["answer_used"] is True


def test_contact_route_retrieval_is_null():
    body = _collect(
        run_stream(
            [{"role": "user", "content": "how do I reach you?"}],
            triage_fn=_triage("contact", 0.9),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(["Email me."]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
        )
    )
    assert _finish_metadata(body)["retrieval"] is None


def test_knowledge_clarify_attaches_ungrounded_retrieval():
    # A low-confidence KNOWLEDGE query retrieves first; with nothing grounded it
    # clarifies, but now carries the (ungrounded) retrieval telemetry rather than
    # null — the search genuinely ran before the clarify decision.
    body = _collect(
        run_stream(
            [{"role": "user", "content": "huh?"}],
            triage_fn=_triage("general", 0.1, question="What do you mean?"),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(()),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
        )
    )
    meta = _finish_metadata(body)
    assert meta["retrieval"] is not None
    assert meta["retrieval"]["grounded"] is False
    assert meta["route"] == "respond"
    assert "What do you mean?" in body


def test_tool_route_clarify_retrieval_is_null():
    # Tool routes (scheduler/contact) still clarify UP FRONT when triage is unsure
    # — retrieval can't rescue a fixed-context answer — so retrieval stays null.
    body = _collect(
        run_stream(
            [{"role": "user", "content": "huh?"}],
            triage_fn=_triage("contact", 0.1, question="What do you mean?"),
            retriever_retrieve=lambda q: RetrievalResult(chunks=[], sources=[]),
            draft_stream_fn=lambda s, m, c: iter(()),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
        )
    )
    assert '"retrieval":null' in body
    assert "What do you mean?" in body


def _resolved(distance=0.05, answer="Curated answer.", title="Are you sure?"):
    return ResolvedAnswer(
        answer=answer,
        document_id="doc-1",
        cluster_id="cl-1",
        title=title,
        distance=distance,
    )


def _counting_triage(intent="general", confidence=0.9):
    state = {"called": False}

    def _fn(messages):
        state["called"] = True
        return TriageResult(
            intent=intent, confidence=confidence, clarifying_question=None
        )

    return _fn, state


def test_resolved_gap_match_emits_verbatim_and_skips_triage():
    triage, tstate = _counting_triage()
    body = _collect(
        run_stream(
            [{"role": "user", "content": "are you sure?"}],
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["llm noise"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            embed_fn=_embed_stub,
            gap_match_fn=lambda emb: _resolved(distance=0.05),
            gap_match_threshold=0.15,
        )
    )
    meta = _finish_metadata(body)
    assert tstate["called"] is False  # LLM router skipped entirely
    assert '"delta":"Curated answer."' in body  # verbatim, no draft LLM
    assert '"delta":"llm noise"' not in body
    assert meta["route"] == "gap"
    assert meta["intent"] == "gap"
    assert meta["miss"] is None  # a resolved hit records NO new miss
    assert meta["sources"] == [
        {"source": "document:doc-1", "title": "Are you sure?", "score": 0.95}
    ]
    retr = meta["retrieval"]
    assert retr["intent"] == "gap"
    assert retr["grounded"] is True
    assert retr["gap_distance"] == 0.05
    assert "Found a saved answer…" in meta["steps"]
    assert body.rstrip().endswith("[DONE]")


def test_gap_match_outside_threshold_falls_through_to_triage():
    triage, tstate = _counting_triage(intent="contact")
    body = _collect(
        run_stream(
            [{"role": "user", "content": "unrelated"}],
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["from tool"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
            embed_fn=_embed_stub,
            gap_match_fn=lambda emb: _resolved(distance=0.4),
            gap_match_threshold=0.15,
        )
    )
    assert tstate["called"] is True
    assert '"route":"gap"' not in body
    assert '"delta":"from tool"' in body


def test_gap_match_failure_falls_through_to_triage():
    def boom(_emb):
        raise RuntimeError("db down")

    triage, tstate = _counting_triage(intent="contact")
    body = _collect(
        run_stream(
            [{"role": "user", "content": "hi"}],
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
            embed_fn=_embed_stub,
            gap_match_fn=boom,
            gap_match_threshold=0.15,
        )
    )
    assert tstate["called"] is True
    assert '"delta":"ok"' in body


def test_gap_embed_failure_falls_through_to_triage():
    def bad_embed(_q):
        raise RuntimeError("ollama down")

    triage, tstate = _counting_triage(intent="contact")
    body = _collect(
        run_stream(
            [{"role": "user", "content": "hi"}],
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
            embed_fn=bad_embed,
            gap_match_fn=lambda emb: _resolved(),
            gap_match_threshold=0.15,
        )
    )
    assert tstate["called"] is True
    assert '"delta":"ok"' in body


def test_gap_path_disabled_when_fn_absent():
    # Back-compat: every pre-existing test calls run_stream without gap_match_fn.
    triage, tstate = _counting_triage(intent="contact")
    _collect(
        run_stream(
            [{"role": "user", "content": "hi"}],
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
            embed_fn=_embed_stub,
        )
    )
    assert tstate["called"] is True


def test_lead_capture_still_beats_gap_match():
    # Pipeline order: capture stays first — a visitor handing over contact info
    # must be captured even if their text embeds near a resolved cluster.
    body = _collect(
        run_stream(
            [{"role": "user", "content": "sure, it's jane@doe.dev"}],
            triage_fn=_triage("general", 0.9),
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["x"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {},
            embed_fn=_embed_stub,
            gap_match_fn=lambda emb: _resolved(distance=0.01),
            gap_match_threshold=0.15,
        )
    )
    assert '"route":"lead"' in body
    assert '"route":"gap"' not in body


def test_triage_receives_only_last_six_messages():
    captured = {}

    def triage(messages):
        captured["messages"] = messages
        return TriageResult(intent="contact", confidence=0.9, clarifying_question=None)

    # 9 alternating turns ending on a user message (i=8 even → user).
    msgs = [
        {"role": "assistant" if i % 2 else "user", "content": f"m{i}"} for i in range(9)
    ]
    _collect(
        run_stream(
            msgs,
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
        )
    )
    assert captured["messages"] == msgs[-6:]


def test_short_conversation_passes_all_messages_to_triage():
    captured = {}

    def triage(messages):
        captured["messages"] = messages
        return TriageResult(intent="contact", confidence=0.9, clarifying_question=None)

    msgs = [{"role": "user", "content": "hi"}]
    _collect(
        run_stream(
            msgs,
            triage_fn=triage,
            retriever_retrieve=lambda q: RetrievalResult([], []),
            draft_stream_fn=lambda s, m, c: iter(["ok"]),
            schedule_fn=lambda: {},
            contact_fn=lambda: {"email": "a@b.c"},
        )
    )
    assert captured["messages"] == msgs
