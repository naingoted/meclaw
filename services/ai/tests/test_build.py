"""Test graph assembly with conditional routing."""

from app.graph.build import build_graph, GraphDeps
from app.retriever import RetrievalResult, RetrievedChunk


def _deps():
    def triage_fn(messages):
        from app.graph.nodes import TriageResult
        text = messages[-1]["content"]
        if "schedule" in text:
            return TriageResult("scheduler", 0.95, None)
        if "vague" in text:
            return TriageResult("general", 0.1, "What do you mean?")
        return TriageResult("tech", 0.9, None)

    def retrieve(query):
        return RetrievalResult(
            chunks=[RetrievedChunk("d#0", "a.md", "A", "Thet uses Python.", 0, 0.8)],
            sources=[{"source": "a.md", "title": "A", "score": 0.8}],
        )

    def draft_fn(system, messages, context):
        return "drafted answer"

    return GraphDeps(
        triage_fn=triage_fn,
        retriever_retrieve=retrieve,
        draft_fn=draft_fn,
        schedule_fn=lambda: {"url": "https://cal.com/tet-nai"},
        contact_fn=lambda: {"email": "naingoted@gmail.com"},
    )


def test_tech_question_routes_to_knowledge_and_drafts():
    graph = build_graph(_deps())
    final = graph.invoke({"messages": [{"role": "user", "content": "what stack?"}]})
    assert final["route"] == "tech"
    assert final["draft"] == "drafted answer"
    assert final["sources"][0]["source"] == "a.md"


def test_schedule_question_routes_to_scheduler():
    graph = build_graph(_deps())
    final = graph.invoke({"messages": [{"role": "user", "content": "schedule a call"}]})
    assert final["route"] == "scheduler"
    assert "drafted answer" == final["draft"]


def test_vague_question_short_circuits_to_clarification():
    graph = build_graph(_deps())
    final = graph.invoke({"messages": [{"role": "user", "content": "vague thing"}]})
    assert final["needs_clarification"] is True
    assert final["clarifying_question"] == "What do you mean?"
