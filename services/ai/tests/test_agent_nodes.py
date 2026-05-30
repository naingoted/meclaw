from app.retriever import RetrievalResult, RetrievedChunk
from app.graph.nodes import (
    contact_node,
    knowledge_node,
    scheduler_node,
)


def _chunk(text: str) -> RetrievedChunk:
    return RetrievedChunk(
        id="d#0", source="about.md", title="About", text=text, ordinal=0, score=0.8
    )


def test_knowledge_node_retrieves_and_drafts():
    captured = {}

    def fake_retrieve(query: str) -> RetrievalResult:
        captured["query"] = query
        return RetrievalResult(chunks=[_chunk("Thet uses Python.")], sources=[{"source": "about.md", "title": "About", "score": 0.8}])

    def fake_draft(system: str, messages, context: str) -> str:
        captured["context"] = context
        return "Thet uses Python and Next.js."

    state = {"messages": [{"role": "user", "content": "stack?"}], "intent": "tech"}
    out = knowledge_node(state, retriever_retrieve=fake_retrieve, draft_fn=fake_draft, persona="tech")

    assert captured["query"] == "stack?"
    assert "Thet uses Python." in captured["context"]
    assert out["draft"] == "Thet uses Python and Next.js."
    assert out["sources"] == [{"source": "about.md", "title": "About", "score": 0.8}]


def test_scheduler_node_uses_tool():
    def fake_schedule() -> dict:
        return {"url": "https://cal.com/tet-nai"}

    def fake_draft(system: str, messages, context: str) -> str:
        assert "cal.com/tet-nai" in context
        return "You can book here: https://cal.com/tet-nai"

    state = {"messages": [{"role": "user", "content": "can we talk?"}]}
    out = scheduler_node(state, schedule_fn=fake_schedule, draft_fn=fake_draft)
    assert "cal.com/tet-nai" in out["draft"]


def test_contact_node_uses_tool():
    def fake_contact() -> dict:
        return {"email": "thetnaing@incube8.sg"}

    def fake_draft(system: str, messages, context: str) -> str:
        assert "thetnaing@incube8.sg" in context
        return "Email: thetnaing@incube8.sg"

    state = {"messages": [{"role": "user", "content": "how to reach?"}]}
    out = contact_node(state, contact_fn=fake_contact, draft_fn=fake_draft)
    assert "thetnaing@incube8.sg" in out["draft"]
