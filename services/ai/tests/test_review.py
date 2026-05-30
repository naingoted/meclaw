from app.graph.nodes import FALLBACK_TEXT, review_node


def test_review_passes_grounded_draft():
    state = {
        "draft": "Thet uses Python.",
        "retrieved_chunks": [object()],  # non-empty retrieval
        "intent": "tech",
        "needs_clarification": False,
    }
    out = review_node(state)
    assert out["draft"] == "Thet uses Python."


def test_review_downgrades_ungrounded_factual_claim():
    state = {
        "draft": "Thet worked at Google for ten years.",
        "retrieved_chunks": [],  # empty retrieval
        "intent": "tech",
        "needs_clarification": False,
    }
    out = review_node(state)
    assert out["draft"] == FALLBACK_TEXT


def test_review_skips_when_clarifying():
    state = {
        "draft": None,
        "clarifying_question": "What do you mean?",
        "needs_clarification": True,
    }
    out = review_node(state)
    # Clarification path: review leaves the draft for respond to emit the question.
    assert out.get("draft") in (None,)


def test_review_allows_ungrounded_for_tool_intents():
    # scheduler/contact answers come from tools, not retrieval — empty chunks is fine.
    state = {
        "draft": "Book here: https://cal.com/tet-nai",
        "retrieved_chunks": [],
        "intent": "scheduler",
        "needs_clarification": False,
    }
    out = review_node(state)
    assert out["draft"] == "Book here: https://cal.com/tet-nai"
