import json

from app.research.persist import RunWriter


class _FakeConn:
    def __init__(self, sink):
        self._sink = sink

    def execute(self, sql, params=None):
        self._sink.append((" ".join(sql.split()), params))

        class _Cur:
            def fetchone(_self):
                return ["run-123"]

        return _Cur()

    def commit(self):
        self._sink.append(("COMMIT", None))


def test_start_run_inserts_running_row_and_returns_id():
    sink = []
    writer = RunWriter(connect=lambda: _Ctx(_FakeConn(sink)))
    run_id = writer.start_run({"company": "Acme"}, {"planner": "m"})
    assert run_id == "run-123"
    insert = next(s for s in sink if s[0].startswith("INSERT INTO agent_runs"))
    assert insert[1][1] == json.dumps({"company": "Acme"})  # input jsonb param
    assert "running" in insert[0]


def test_add_step_inserts_with_seq_and_role():
    sink = []
    writer = RunWriter(connect=lambda: _Ctx(_FakeConn(sink)))
    writer.add_step(
        "run-123",
        seq=2,
        role="researcher",
        input={"q": "x"},
        output={"text": "n"},
        tool_calls=[{"name": "search_corpus"}],
        verdict="good",
        score=0.8,
        retry_index=0,
        duration_ms=12,
    )
    step = next(s for s in sink if s[0].startswith("INSERT INTO agent_steps"))
    assert step[1][0] == "run-123"  # runId
    assert step[1][1] == 2  # seq
    assert step[1][2] == "researcher"


def test_finish_run_updates_status_and_report():
    sink = []
    writer = RunWriter(connect=lambda: _Ctx(_FakeConn(sink)))
    writer.finish_run(
        "run-123",
        status="done",
        report={"summary": "s"},
        eval_records=[],
        totals={"subtasks": 1, "retries": 0, "toolCalls": 2, "tokens": 0},
    )
    upd = next(s for s in sink if s[0].startswith("UPDATE agent_runs"))
    assert "status" in upd[0] and upd[1][0] == "done"


class _Ctx:
    """Context-manager wrapper around a fake connection (psycopg.connect() style)."""

    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, *a):
        return False
