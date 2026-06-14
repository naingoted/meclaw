from dataclasses import dataclass
from app.retriever import RetrievalResult, RetrievedChunk
from app.graph.nodes import (
    contact_node,
    knowledge_node,
    scheduler_node,
    default_triage_fn,
    default_draft_fn,
)


def _chunk(text: str) -> RetrievedChunk:
    return RetrievedChunk(
        id="d#0", source="about.md", title="About", text=text, ordinal=0, score=0.8
    )


def test_knowledge_node_retrieves_and_drafts():
    captured = {}

    def fake_retrieve(query: str) -> RetrievalResult:
        captured["query"] = query
        return RetrievalResult(
            chunks=[_chunk("Thet uses Python.")],
            sources=[{"source": "about.md", "title": "About", "score": 0.8}],
        )

    def fake_draft(system: str, messages, context: str) -> str:
        captured["context"] = context
        return "Thet uses Python and Next.js."

    state = {"messages": [{"role": "user", "content": "stack?"}], "intent": "tech"}
    out = knowledge_node(
        state, retriever_retrieve=fake_retrieve, draft_fn=fake_draft, persona="tech"
    )

    assert captured["query"] == "stack?"
    assert "Thet uses Python." in captured["context"]
    assert out["draft"] == "Thet uses Python and Next.js."
    assert out["sources"] == [{"source": "about.md", "title": "About", "score": 0.8}]


def test_knowledge_node_degrades_gracefully_on_retriever_failure():
    """Test that knowledge_node handles retriever failure without raising."""
    captured = {}

    def failing_retrieve(query: str) -> RetrievalResult:
        raise RuntimeError("RAG backend down")

    def fake_draft(system: str, messages, context: str) -> str:
        captured["context"] = context
        captured["draft_called"] = True
        return "I'm not certain about that."

    state = {
        "messages": [{"role": "user", "content": "what's your stack?"}],
        "intent": "tech",
    }
    # Should NOT raise; should return empty chunks and still draft.
    out = knowledge_node(
        state, retriever_retrieve=failing_retrieve, draft_fn=fake_draft, persona="tech"
    )

    assert captured["draft_called"] is True
    assert captured["context"] == ""  # empty context string
    assert out["retrieved_chunks"] == []
    assert out["sources"] == []
    assert out["draft"] == "I'm not certain about that."


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
        return {"email": "naingoted@gmail.com"}

    def fake_draft(system: str, messages, context: str) -> str:
        assert "naingoted@gmail.com" in context
        return "Email: naingoted@gmail.com"

    state = {"messages": [{"role": "user", "content": "how to reach?"}]}
    out = contact_node(state, contact_fn=fake_contact, draft_fn=fake_draft)
    assert "naingoted@gmail.com" in out["draft"]


# --- Greeting detection tests -----------------------------------------------


def test_is_greeting_matches_bare_hi():
    """Test that 'hi' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hi") is True


def test_is_greeting_matches_hello():
    """Test that 'hello' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hello") is True


def test_is_greeting_case_insensitive():
    """Test that greeting matching is case-insensitive."""
    from app.graph.nodes import is_greeting

    assert is_greeting("Hello") is True
    assert is_greeting("HELLO") is True
    assert is_greeting("HeLLo") is True


def test_is_greeting_with_trailing_punctuation():
    """Test that trailing !, ., or , are tolerated."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hi!") is True
    assert is_greeting("hello.") is True
    assert is_greeting("hey,") is True


def test_is_greeting_with_leading_trailing_whitespace():
    """Test that leading/trailing whitespace is stripped."""
    from app.graph.nodes import is_greeting

    assert is_greeting("  hi  ") is True
    assert is_greeting("  hello  ") is True


def test_is_greeting_matches_hey():
    """Test that 'hey' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hey") is True


def test_is_greeting_matches_hiya():
    """Test that 'hiya' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hiya") is True


def test_is_greeting_matches_thanks():
    """Test that 'thanks' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("thanks") is True


def test_is_greeting_matches_thank_you():
    """Test that 'thank you' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("thank you") is True


def test_is_greeting_matches_good_morning():
    """Test that 'good morning' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("good morning") is True


def test_is_greeting_matches_good_afternoon():
    """Test that 'good afternoon' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("good afternoon") is True


def test_is_greeting_matches_good_evening():
    """Test that 'good evening' is recognized as a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("good evening") is True


def test_is_greeting_rejects_greeting_with_question():
    """Test that a greeting followed by a question is not recognized."""
    from app.graph.nodes import is_greeting

    assert is_greeting("hi, what's your stack?") is False
    assert is_greeting("hello there") is False
    assert is_greeting("hi what's up") is False


def test_is_greeting_rejects_empty_string():
    """Test that empty string is not a greeting."""
    from app.graph.nodes import is_greeting

    assert is_greeting("") is False


def test_is_greeting_rejects_non_greeting():
    """Test that non-greetings are rejected."""
    from app.graph.nodes import is_greeting

    assert is_greeting("what's your tech stack?") is False
    assert is_greeting("how do I reach you?") is False
    assert is_greeting("tell me about your projects") is False


# --- Thinking-mode compatibility tests ------------------------------------


@dataclass
class FakeResponse:
    """Fake LLM response for testing."""

    content: str | list


def test_extract_text_string():
    """Test _extract_text with plain string content."""
    from app.graph.nodes import _extract_text

    assert _extract_text("hi") == "hi"


def test_extract_text_list_with_thinking_block():
    """Test _extract_text with thinking blocks (should be dropped)."""
    from app.graph.nodes import _extract_text

    content = [
        {"type": "thinking", "thinking": "Hmm, let me think about this..."},
        {"type": "text", "text": "Hello"},
    ]
    assert _extract_text(content) == "Hello"


def test_extract_text_mixed_blocks():
    """Test _extract_text with mixed string and dict blocks."""
    from app.graph.nodes import _extract_text

    content = ["a", {"type": "text", "text": "b"}]
    assert _extract_text(content) == "ab"


def test_extract_text_ignores_non_string_text():
    """Test _extract_text ignores non-string text values."""
    from app.graph.nodes import _extract_text

    assert (
        _extract_text([{"type": "text", "text": None}, {"type": "text", "text": "ok"}])
        == "ok"
    )


def test_default_triage_fn_with_json_response():
    """Test triage via JSON prompt with list-of-blocks content."""

    def fake_model():
        class FakeInvoke:
            def invoke(self, messages):
                # Simulate thinking mode: content is list with thinking + text blocks
                return FakeResponse(
                    content=[
                        {"type": "thinking", "thinking": "User asked about stack..."},
                        {
                            "type": "text",
                            "text": '{"intent":"tech","confidence":0.9,"clarifying_question":null}',
                        },
                    ]
                )

        return FakeInvoke()

    triage_fn = default_triage_fn(fake_model())
    result = triage_fn([{"role": "user", "content": "what stack do you use?"}])

    assert result.intent == "tech"
    assert result.confidence == 0.9
    assert result.clarifying_question is None


def test_default_triage_fn_tolerates_code_fence():
    """Test triage tolerates markdown code fence in response."""

    def fake_model():
        class FakeInvoke:
            def invoke(self, messages):
                return FakeResponse(
                    content='```json\n{"intent":"scheduler","confidence":0.8,"clarifying_question":null}\n```'
                )

        return FakeInvoke()

    triage_fn = default_triage_fn(fake_model())
    result = triage_fn([{"role": "user", "content": "can we talk?"}])

    assert result.intent == "scheduler"
    assert result.confidence == 0.8


def test_default_triage_fn_invalid_intent_maps_to_general():
    """Test invalid intent falls back to 'general'."""

    def fake_model():
        class FakeInvoke:
            def invoke(self, messages):
                return FakeResponse(
                    content='{"intent":"weather","confidence":0.7,"clarifying_question":null}'
                )

        return FakeInvoke()

    triage_fn = default_triage_fn(fake_model())
    result = triage_fn([{"role": "user", "content": "what's the weather?"}])

    assert result.intent == "general"  # invalid intent → general


def test_default_triage_fn_unparseable_degrades_gracefully():
    """Test unparseable content returns low-confidence general result."""

    def fake_model():
        class FakeInvoke:
            def invoke(self, messages):
                return FakeResponse(content="no json here at all")

        return FakeInvoke()

    triage_fn = default_triage_fn(fake_model())
    result = triage_fn([{"role": "user", "content": "hello"}])

    # A parse failure is a router fault, not user ambiguity: degrade to the
    # general route (no clarifying question) so the question still gets answered.
    assert result.intent == "general"
    assert result.confidence == 0.0
    assert result.clarifying_question is None


def test_default_draft_fn_extracts_text_from_blocks():
    """Test draft_fn cleans thinking blocks from response."""

    def fake_model():
        class FakeInvoke:
            def invoke(self, messages):
                return FakeResponse(
                    content=[
                        {"type": "thinking", "thinking": "User asked about stack..."},
                        {"type": "text", "text": "Thet uses Python and Next.js."},
                    ]
                )

        return FakeInvoke()

    draft_fn = default_draft_fn(fake_model())
    result = draft_fn("You are helpful", [{"role": "user", "content": "stack?"}], "")

    # Should NOT include the thinking block
    assert result == "Thet uses Python and Next.js."
    assert "thinking" not in result
