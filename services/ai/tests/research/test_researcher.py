from app.research.researcher import make_researcher
from app.research.tool_caller import Proposal, Tool, ToolCall


class _ScriptedCaller:
    """Emits a queued sequence of Proposals."""

    def __init__(self, script):
        self._script = list(script)

    def propose(self, messages, tools):
        return self._script.pop(0)


def _tool(name, result):
    return Tool(name=name, description="d", args_schema={}, run=lambda args: result)


def test_runs_tools_then_finalizes_note():
    caller = _ScriptedCaller(
        [
            Proposal(calls=[ToolCall(name="search_corpus", args={"query": "stack"})], content=""),
            Proposal(calls=[], content="Thet built the LangGraph sidecar."),
        ]
    )
    tools = [_tool("search_corpus", {"results": [{"source": "about.md", "score": 0.7}]})]
    note = make_researcher(caller, tools, max_steps=4)(
        {"id": "s1", "query": "stack", "source": "owner_corpus"}
    )
    assert note["text"] == "Thet built the LangGraph sidecar."
    assert note["tool_calls"] == 1
    assert {"source": "about.md", "score": 0.7} in note["sources"]


def test_loop_guard_stops_at_max_steps_even_if_model_keeps_calling():
    caller = _ScriptedCaller(
        [Proposal(calls=[ToolCall(name="search_corpus")], content="") for _ in range(10)]
    )
    tools = [_tool("search_corpus", {"results": []})]
    note = make_researcher(caller, tools, max_steps=3)(
        {"id": "s1", "query": "q", "source": "owner_corpus"}
    )
    assert note["tool_calls"] == 3  # capped


def test_empty_first_proposal_yields_empty_note_text():
    caller = _ScriptedCaller([Proposal(calls=[], content="")])
    note = make_researcher(caller, [], max_steps=4)(
        {"id": "s1", "query": "q", "source": "web"}
    )
    assert note["text"] == ""
    assert note["tool_calls"] == 0
