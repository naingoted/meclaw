"""Assemble the LangGraph StateGraph. All node dependencies are injected via
GraphDeps so the graph is fully testable without live LLM/Qdrant/Ollama."""

from __future__ import annotations

from dataclasses import dataclass
from functools import partial
from typing import Callable

from langgraph.graph import END, START, StateGraph

from app.graph.nodes import (
    TriageResult,
    contact_node,
    knowledge_node,
    review_node,
    scheduler_node,
    triage_node,
)
from app.graph.state import GraphState
from app.retriever import RetrievalResult


@dataclass(frozen=True)
class GraphDeps:
    triage_fn: Callable[[list[dict]], TriageResult]
    retriever_retrieve: Callable[[str], RetrievalResult]
    draft_fn: Callable[[str, list[dict], str], str]
    schedule_fn: Callable[[], dict]
    contact_fn: Callable[[], dict]


def _route_after_triage(state: GraphState) -> str:
    if state.get("needs_clarification"):
        return "clarify"
    intent = state.get("intent")
    if intent == "scheduler":
        return "scheduler"
    if intent == "contact":
        return "contact"
    # tech | project | general all use the knowledge node (persona = intent).
    return "knowledge"


def build_graph(deps: GraphDeps):
    graph = StateGraph(GraphState)

    graph.add_node("triage", partial(triage_node, triage_fn=deps.triage_fn))
    graph.add_node(
        "knowledge",
        lambda s: knowledge_node(
            s,
            retriever_retrieve=deps.retriever_retrieve,
            draft_fn=deps.draft_fn,
            persona=s.get("intent") or "general",
        ),
    )
    graph.add_node(
        "scheduler",
        partial(scheduler_node, schedule_fn=deps.schedule_fn, draft_fn=deps.draft_fn),
    )
    graph.add_node(
        "contact",
        partial(contact_node, contact_fn=deps.contact_fn, draft_fn=deps.draft_fn),
    )
    graph.add_node("review", review_node)

    graph.add_edge(START, "triage")
    graph.add_conditional_edges(
        "triage",
        _route_after_triage,
        {
            "clarify": END,        # clarification text emitted by the streaming layer
            "knowledge": "knowledge",
            "scheduler": "scheduler",
            "contact": "contact",
        },
    )
    graph.add_edge("knowledge", "review")
    graph.add_edge("scheduler", "review")
    graph.add_edge("contact", "review")
    graph.add_edge("review", END)

    return graph.compile()
