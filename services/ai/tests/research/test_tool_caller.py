from app.research.tool_caller import (
    JsonToolCaller,
    Proposal,
    Tool,
    ToolCall,
    dispatch,
)


class _FakeModel:
    """Returns queued responses; records the prompts it was called with."""

    def __init__(self, contents):
        self._contents = list(contents)
        self.calls = []

    def invoke(self, messages):
        self.calls.append(messages)

        class _R:
            content = self._contents.pop(0)

        return _R()


def _tools():
    ran = {}

    def _search(args):
        ran["search"] = args
        return {"results": ["x"]}

    return [
        Tool(name="search_corpus", description="search", args_schema={"query": "str"}, run=_search),
    ], ran


def test_json_caller_parses_a_tool_call():
    model = _FakeModel(['{"tool": "search_corpus", "args": {"query": "stack"}}'])
    tools, _ = _tools()
    prop = JsonToolCaller(model).propose([{"role": "user", "content": "go"}], tools)
    assert prop.calls == [ToolCall(name="search_corpus", args={"query": "stack"})]
    assert prop.content == ""


def test_json_caller_done_yields_final_content():
    model = _FakeModel(['{"done": true, "answer": "Thet built the sidecar."}'])
    tools, _ = _tools()
    prop = JsonToolCaller(model).propose([{"role": "user", "content": "go"}], tools)
    assert prop.calls == []
    assert prop.content == "Thet built the sidecar."


def test_json_caller_unparseable_degrades_to_done_with_raw_text():
    model = _FakeModel(["I could not find anything useful."])
    tools, _ = _tools()
    prop = JsonToolCaller(model).propose([{"role": "user", "content": "go"}], tools)
    assert prop.calls == []
    assert "could not find" in prop.content


def test_dispatch_runs_named_tool():
    tools, ran = _tools()
    out = dispatch(ToolCall(name="search_corpus", args={"query": "stack"}), tools)
    assert ran["search"] == {"query": "stack"}
    assert out == {"results": ["x"]}


def test_dispatch_unknown_tool_returns_error_marker():
    tools, _ = _tools()
    out = dispatch(ToolCall(name="nope", args={}), tools)
    assert out["error"].startswith("unknown tool")


def test_native_caller_reads_tool_calls_from_bound_model():
    from app.research.tool_caller import NativeToolCaller

    class _Bound:
        def invoke(self, messages):
            class _R:
                content = ""
                tool_calls = [{"name": "search_corpus", "args": {"query": "stack"}}]

            return _R()

    class _Model:
        def __init__(self):
            self.bound_with = None

        def bind_tools(self, specs):
            self.bound_with = specs
            return _Bound()

    tools, _ = _tools()
    model = _Model()
    prop = NativeToolCaller(model).propose([{"role": "user", "content": "go"}], tools)
    assert prop.calls[0].name == "search_corpus"
    assert prop.calls[0].args == {"query": "stack"}
    assert model.bound_with is not None  # tools were bound


def test_native_caller_no_tool_calls_means_done():
    from app.research.tool_caller import NativeToolCaller

    class _Bound:
        def invoke(self, messages):
            class _R:
                content = "Thet built the sidecar."
                tool_calls = []

            return _R()

    class _Model:
        def bind_tools(self, specs):
            return _Bound()

    tools, _ = _tools()
    prop = NativeToolCaller(_Model()).propose([{"role": "user", "content": "go"}], tools)
    assert prop.calls == []
    assert "sidecar" in prop.content
