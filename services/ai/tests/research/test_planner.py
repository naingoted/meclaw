from app.research.planner import make_planner, make_replanner


class _Model:
    def __init__(self, content):
        self._content = content

    def invoke(self, messages):
        class _R:
            content = self._content

        return _R()


def test_planner_decomposes_into_typed_subtasks():
    model = _Model(
        '{"subtasks": ['
        '{"query": "Thet backend experience", "source": "owner_corpus"},'
        '{"query": "Acme Corp tech stack", "source": "web"}]}'
    )
    subtasks = make_planner(model, max_subtasks=6)({"company": "Acme", "role": "Backend"})
    assert len(subtasks) == 2
    assert subtasks[0]["source"] == "owner_corpus"
    assert subtasks[0]["status"] == "pending"
    assert subtasks[0]["retry_count"] == 0
    assert subtasks[0]["id"]  # assigned


def test_planner_caps_subtasks_and_defaults_bad_source():
    items = ",".join(['{"query": "q%d", "source": "bogus"}' % i for i in range(10)])
    subtasks = make_planner(_Model('{"subtasks": [' + items + "]}"), max_subtasks=3)({"role": "X"})
    assert len(subtasks) == 3
    assert all(s["source"] == "web" for s in subtasks)  # invalid → web fallback


def test_planner_parse_failure_yields_single_corpus_subtask():
    subtasks = make_planner(_Model("sorry no json"), max_subtasks=6)({"company": "Acme"})
    assert len(subtasks) == 1
    assert subtasks[0]["source"] == "owner_corpus"


def test_replanner_rewrites_query_and_keeps_source():
    model = _Model('{"query": "Thet backend projects with Postgres"}')
    revised = make_replanner(model)(
        {"id": "s1", "query": "Thet backend", "source": "owner_corpus"}, "too vague"
    )
    assert revised["query"] != "Thet backend"
    assert revised["source"] == "owner_corpus"
