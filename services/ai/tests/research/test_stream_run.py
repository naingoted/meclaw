from app.research.stream_run import label_for, stream_research


class _FakeGraph:
    def __init__(self, updates):
        self._updates = updates

    def stream(self, state, *, stream_mode="updates"):
        assert state == {"request": {"company": "Acme"}}
        assert stream_mode == "updates"
        yield from self._updates


class _Writer:
    def __init__(self):
        self.started = None
        self.steps = []
        self.finished = None
        self.failed = None

    def start_run(self, request, model_set, use_case="briefing"):
        self.started = (request, model_set)
        return "run-1"

    def add_step(self, run_id, **kw):
        self.steps.append(kw.get("role"))

    def finish_run(self, run_id, *, status, report, eval_records, totals):
        self.finished = (status, report, totals)

    def fail_run(self, run_id, error):
        self.failed = error


def _sub(id_, query, *, status="resolved", note=True):
    s = {"id": id_, "query": query, "source": "owner_corpus", "status": status,
         "retry_count": 0, "verdict": "good" if status == "resolved" else "bad", "score": 0.8}
    if note:
        s["note"] = {"text": "n", "sources": [], "tool_calls": 1}
    return s


def test_label_for_maps_each_node():
    view = {"cursor": 0, "subtasks": [{"query": "q1"}]}
    assert label_for("plan", {}, view) == "Planning research"
    assert "q1" in label_for("research", {"subtasks": [{"query": "q1"}]}, view)
    assert label_for("validate", {}, view) == "Validating findings"
    assert "retry 1" in label_for("retry", {"retries": 1}, view)
    assert label_for("advance", {"cursor": 1}, view) is None
    assert label_for("unknown", {}, view) is None
    assert label_for("synthesize", {"report": {}, "status": "done"}, view) == "Synthesizing briefing"


def test_stream_research_emits_status_then_report_and_persists():
    writer = _Writer()
    updates = [
        {
            "plan": {
                "subtasks": [
                    _sub("a", "q-a", status="pending", note=False),
                    _sub("b", "q-b", status="pending", note=False),
                ],
                "cursor": 0,
            }
        },
        {"research": {"subtasks": [_sub("a", "q-a")], "iterations": 1, "tool_calls": 1}},
        {"validate": {"subtasks": [_sub("a", "q-a")]}},
        {
            "advance": {
                "subtasks": [_sub("a", "q-a"), _sub("b", "q-b", status="pending", note=False)],
                "cursor": 1,
                "notes": [{"text": "n"}],
            }
        },
        {"research": {"subtasks": [_sub("a", "q-a"), _sub("b", "q-b")], "iterations": 2, "tool_calls": 2}},
        {"validate": {"subtasks": [_sub("a", "q-a"), _sub("b", "q-b")]}},
        {"advance": {"subtasks": [_sub("a", "q-a"), _sub("b", "q-b")], "cursor": 2, "notes": [{"text": "n"}, {"text": "n"}]}},
        {"synthesize": {"report": {"summary": "done"}, "status": "done"}},
    ]
    frames = list(stream_research(
        {"company": "Acme"}, writer=writer, graph=_FakeGraph(updates), model_set={"planner": "m"},
    ))
    text = "".join(frames)
    assert '"type":"data-status"' in text and "Planning research" in text
    assert "Researching: q-a" in text
    assert "Researching: q-b" in text
    assert "Synthesizing briefing" in text
    assert '"type":"data-report"' in text and '"summary":"done"' in text
    assert text.rstrip().endswith("[DONE]")
    assert "planner" in writer.steps and "researcher" in writer.steps and "synthesizer" in writer.steps
    assert writer.finished[0] == "done"


def test_stream_research_marks_failed_run_on_graph_error():
    writer = _Writer()

    class _Boom:
        def stream(self, state, *, stream_mode="updates"):
            yield {"plan": {"subtasks": [], "cursor": 0}}
            raise RuntimeError("graph blew up")

    frames = list(stream_research({"company": "Acme"}, writer=writer, graph=_Boom()))
    text = "".join(frames)
    assert writer.failed == "graph blew up"
    assert writer.finished is None
    assert "synthesizer" not in writer.steps
    assert '"status":"error"' in text
    assert text.rstrip().endswith("[DONE]")
