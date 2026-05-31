from app.graph.nodes import TriageResult, triage_node


def make_state(text: str) -> dict:
    return {"messages": [{"role": "user", "content": text}]}


def test_triage_routes_high_confidence():
    def fake_triage(_messages):
        return TriageResult(intent="tech", confidence=0.9, clarifying_question=None)

    state = make_state("what languages does Thet use?")
    out = triage_node(state, triage_fn=fake_triage)

    assert out["intent"] == "tech"
    assert out["route"] == "tech"
    assert out["needs_clarification"] is False


def test_triage_low_confidence_without_question_routes_best_effort():
    """Low confidence but no clarifying_question (e.g. parse failure degraded to
    general) should attempt an answer, not dead-end on the generic clarify prompt."""
    def fake_triage(_messages):
        return TriageResult(intent="general", confidence=0.0, clarifying_question=None)

    state = make_state("what model are you using?")
    out = triage_node(state, triage_fn=fake_triage)

    assert out["needs_clarification"] is False
    assert out["route"] == "general"
    assert out["intent"] == "general"


def test_triage_low_confidence_sets_clarification():
    def fake_triage(_messages):
        return TriageResult(
            intent="general",
            confidence=0.2,
            clarifying_question="Do you mean his work or his hobbies?",
        )

    state = make_state("tell me about it")
    out = triage_node(state, triage_fn=fake_triage)

    assert out["needs_clarification"] is True
    assert out["clarifying_question"] == "Do you mean his work or his hobbies?"
    assert out["route"] == "respond"
