"""Research graph (Spec C §4 U5): a LangGraph state machine with explicit
transitions and recovery edges. Mirrors app/graph/build.py — all node behavior is
injected via ResearchDeps so the graph is fully testable with mocks.

Flow:
    plan -> research -> validate -> {retry -> research | advance}
    advance -> {research (next subtask) | synthesize}
    synthesize -> END

Budget/loop guards: each research entry increments `iterations`; a bad verdict
only retries while retry_count < retry_budget AND iterations < max_iterations.
On exhaustion the subtask is marked unresolved and excluded — never blocks
synthesis (degrade-not-hang, Spec C §10)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from langgraph.graph import END, START, StateGraph

from app.research.schemas import ResearchState


@dataclass(frozen=True)
class ResearchBudget:
    max_subtasks: int = 6
    retry_budget: int = 2          # per subtask
    max_iterations: int = 24       # global loop guard
    max_tool_calls: int = 30


@dataclass(frozen=True)
class ResearchDeps:
    plan_fn: Callable[[dict], list[dict]]
    research_fn: Callable[[dict], dict]
    replan_fn: Callable[[dict, str], dict]
    validate_fn: Callable[[dict, dict], dict]
    synth_fn: Callable[[dict, list[dict]], dict]
    budget: ResearchBudget


def _plan_node(state: ResearchState, deps: ResearchDeps) -> ResearchState:
    subtasks = deps.plan_fn(state["request"])[: deps.budget.max_subtasks]
    return {
        "subtasks": subtasks,
        "cursor": 0,
        "notes": [],
        "iterations": 0,
        "tool_calls": 0,
        "retries": 0,
        "status": "running",
    }


def _research_node(state: ResearchState, deps: ResearchDeps) -> ResearchState:
    subtasks = [dict(s) for s in state["subtasks"]]
    i = state["cursor"]
    note = deps.research_fn(subtasks[i])
    subtasks[i]["note"] = note
    return {
        "subtasks": subtasks,
        "iterations": state["iterations"] + 1,
        "tool_calls": state["tool_calls"] + int(note.get("tool_calls", 0)),
    }


def _validate_node(state: ResearchState, deps: ResearchDeps) -> ResearchState:
    subtasks = [dict(s) for s in state["subtasks"]]
    i = state["cursor"]
    verdict = deps.validate_fn(subtasks[i], subtasks[i].get("note") or {})
    subtasks[i]["verdict"] = verdict["verdict"]
    subtasks[i]["score"] = verdict.get("score")
    return {"subtasks": subtasks}


def _route_after_validate(state: ResearchState, deps: ResearchDeps) -> str:
    sub = state["subtasks"][state["cursor"]]
    if sub.get("verdict") == "good":
        return "advance"
    can_retry = (
        sub.get("retry_count", 0) < deps.budget.retry_budget
        and state["iterations"] < deps.budget.max_iterations
        and state["tool_calls"] < deps.budget.max_tool_calls
    )
    return "retry" if can_retry else "advance"


def _retry_node(state: ResearchState, deps: ResearchDeps) -> ResearchState:
    subtasks = [dict(s) for s in state["subtasks"]]
    i = state["cursor"]
    revised = deps.replan_fn(subtasks[i], "weak or empty result")
    subtasks[i]["query"] = revised["query"]
    subtasks[i]["retry_count"] = subtasks[i].get("retry_count", 0) + 1
    subtasks[i]["verdict"] = None
    return {"subtasks": subtasks, "retries": state["retries"] + 1}


def _advance_node(state: ResearchState, _deps: ResearchDeps) -> ResearchState:
    subtasks = [dict(s) for s in state["subtasks"]]
    notes = list(state["notes"])
    i = state["cursor"]
    if subtasks[i].get("verdict") == "good":
        subtasks[i]["status"] = "resolved"
        notes.append(subtasks[i]["note"])
    else:
        subtasks[i]["status"] = "unresolved"
    return {"subtasks": subtasks, "notes": notes, "cursor": i + 1}


def _route_after_advance(state: ResearchState) -> str:
    return "research" if state["cursor"] < len(state["subtasks"]) else "synthesize"


def _synthesize_node(state: ResearchState, deps: ResearchDeps) -> ResearchState:
    degraded = any(s.get("status") == "unresolved" for s in state["subtasks"])
    report = deps.synth_fn(state["request"], state["notes"])
    return {"report": report, "status": "degraded" if degraded else "done"}


def build_research_graph(deps: ResearchDeps):
    g = StateGraph(ResearchState)

    g.add_node("plan", lambda s: _plan_node(s, deps))
    g.add_node("research", lambda s: _research_node(s, deps))
    g.add_node("validate", lambda s: _validate_node(s, deps))
    g.add_node("retry", lambda s: _retry_node(s, deps))
    g.add_node("advance", lambda s: _advance_node(s, deps))
    g.add_node("synthesize", lambda s: _synthesize_node(s, deps))

    g.add_edge(START, "plan")
    g.add_edge("plan", "research")
    g.add_edge("research", "validate")
    g.add_conditional_edges(
        "validate",
        lambda s: _route_after_validate(s, deps),
        {"retry": "retry", "advance": "advance"},
    )
    g.add_edge("retry", "research")
    g.add_conditional_edges(
        "advance",
        _route_after_advance,
        {"research": "research", "synthesize": "synthesize"},
    )
    g.add_edge("synthesize", END)

    # Recursion limit must accommodate the worst-case cyclic path:
    # subtasks * (1 + retries) research/validate hops + plan + synthesize, with headroom.
    limit = deps.budget.max_iterations * 4 + 10
    return _Compiled(g.compile(), limit)


class _Compiled:
    """Thin wrapper to apply the budget-derived recursion_limit on invoke."""

    def __init__(self, compiled, recursion_limit: int):
        self._compiled = compiled
        self._limit = recursion_limit

    def invoke(self, state: ResearchState) -> ResearchState:
        return self._compiled.invoke(state, {"recursion_limit": self._limit})
