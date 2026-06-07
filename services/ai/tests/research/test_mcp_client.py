from app.research.mcp_client import adapt_mcp_tools
from app.research.tool_caller import Tool


class _FakeLcTool:
    def __init__(self, name, desc):
        self.name = name
        self.description = desc
        self.args = []

    def invoke(self, args):
        self.args.append(args)
        return {"echo": args}


def test_adapt_wraps_lc_tools_into_tool_seam():
    lc = [_FakeLcTool("search_corpus", "semantic search"), _FakeLcTool("run_read_query", "sql")]
    tools = adapt_mcp_tools(lc)
    assert [t.name for t in tools] == ["search_corpus", "run_read_query"]
    assert all(isinstance(t, Tool) for t in tools)


def test_adapted_tool_run_delegates_to_lc_invoke():
    lc = [_FakeLcTool("search_corpus", "semantic search")]
    tool = adapt_mcp_tools(lc)[0]
    out = tool.run({"query": "stack"})
    assert out == {"echo": {"query": "stack"}}
    assert lc[0].args == [{"query": "stack"}]
