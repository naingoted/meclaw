from dataclasses import dataclass, field

from app.research.graph import ResearchBudget, ResearchDeps, build_research_graph


def _subtask(id_, source="owner_corpus"):
    return {
        "id": id_,
        "query": f"q-{id_}",
        "source": source,
        "status": "pending",
        "retry_count": 0,
        "verdict": None,
        "score": None,
    }


@dataclass
class _Spy:
    research_calls: list = field(default_factory=list)
    replan_calls: list = field(default_factory=list)
    synth_notes: list = field(default_factory=list)


def _deps(spy, *, plan, validate_seq, budget=None):
    seq = list(validate_seq)

    def plan_fn(_request):
        return [dict(s) for s in plan]

    def research_fn(subtask):
        spy.research_calls.append(subtask["query"])
        return {"text": "note for " + subtask["query"], "sources": [], "tool_calls": 1}

    def replan_fn(subtask, reason):
        spy.replan_calls.append((subtask["id"], reason))
        revised = dict(subtask)
        revised["query"] = subtask["query"] + "+revised"
        return revised

    def validate_fn(_subtask, _note):
        return seq.pop(0)

    def synth_fn(_request, notes):
        spy.synth_notes = [n["text"] for n in notes]
        return {"summary": "done", "matched_strengths": [], "gaps": [], "talking_points": [], "sources": []}

    return ResearchDeps(
        plan_fn=plan_fn,
        research_fn=research_fn,
        replan_fn=replan_fn,
        validate_fn=validate_fn,
        synth_fn=synth_fn,
        budget=budget or ResearchBudget(),
    )


def test_happy_path_single_good_subtask():
    spy = _Spy()
    deps = _deps(spy, plan=[_subtask("a")], validate_seq=[{"verdict": "good", "score": 0.9}])
    state = build_research_graph(deps).invoke({"request": {"company": "Acme"}})
    assert state["status"] == "done"
    assert spy.synth_notes == ["note for q-a"]
    assert state["report"]["summary"] == "done"


def test_recovery_retries_bad_then_recovers_no_garbage_downstream():
    spy = _Spy()
    deps = _deps(
        spy,
        plan=[_subtask("a")],
        validate_seq=[{"verdict": "bad", "score": 0.1}, {"verdict": "good", "score": 0.8}],
    )
    state = build_research_graph(deps).invoke({"request": {"company": "Acme"}})
    assert state["status"] == "done"
    assert spy.replan_calls and spy.replan_calls[0][0] == "a"  # re-planned
    assert spy.research_calls == ["q-a", "q-a+revised"]        # retried with revised query
    assert spy.synth_notes == ["note for q-a+revised"]         # only the GOOD note synthesized


def test_retry_budget_exhaustion_marks_unresolved_and_excludes_note():
    spy = _Spy()
    deps = _deps(
        spy,
        plan=[_subtask("a")],
        validate_seq=[{"verdict": "bad", "score": 0.1}] * 5,  # always bad
        budget=ResearchBudget(retry_budget=2, max_iterations=24),
    )
    state = build_research_graph(deps).invoke({"request": {"company": "Acme"}})
    assert state["status"] == "degraded"            # an unresolved subtask
    assert spy.synth_notes == []                    # no garbage reached synthesis
    assert len(spy.research_calls) == 3             # initial + 2 retries (budget)
    assert state["subtasks"][0]["status"] == "unresolved"


def test_two_subtasks_one_good_one_unresolved_is_degraded():
    spy = _Spy()
    deps = _deps(
        spy,
        plan=[_subtask("a"), _subtask("b", source="web")],
        validate_seq=[
            {"verdict": "good", "score": 0.8},   # a
            {"verdict": "bad", "score": 0.1},    # b try 1
            {"verdict": "bad", "score": 0.1},    # b retry 1
            {"verdict": "bad", "score": 0.1},    # b retry 2
        ],
        budget=ResearchBudget(retry_budget=2),
    )
    state = build_research_graph(deps).invoke({"request": {"role": "X"}})
    assert state["status"] == "degraded"
    assert spy.synth_notes == ["note for q-a"]
