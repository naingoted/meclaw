"""C-2 streaming runner: drive the C-1 research graph and emit the Vercel AI-SDK
SSE protocol while persisting the run through the shared RunWriter/persist_steps
path.

Graph nodes stay pure (C-1). This module reads streamed node updates from the
graph (`stream_mode="updates"` -> `{node: returned_delta}`) and maps them to UI
status lines. The cursor is tracked locally because research-node updates do not
carry it."""

from __future__ import annotations

import logging
from typing import Iterator

from app import config
from app import stream as sse
from app.research.graph import build_research_graph
from app.research.persist import RunWriter
from app.research.run import build_research_deps, persist_steps

logger = logging.getLogger(__name__)


def label_for(node: str, delta: dict, view: dict) -> str | None:
    if node == "plan":
        return "Planning research"
    if node == "research":
        subs = (delta.get("subtasks") if isinstance(delta, dict) else None) or view.get("subtasks") or []
        i = view.get("cursor", 0)
        query = subs[i].get("query") if i < len(subs) and isinstance(subs[i], dict) else None
        return f"Researching: {query}" if query else "Researching"
    if node == "validate":
        return "Validating findings"
    if node == "retry":
        n = delta.get("retries") if isinstance(delta, dict) else None
        return f"Refining query (retry {n})" if n else "Refining query"
    if node == "synthesize":
        return "Synthesizing briefing"
    return None


def _default_model_set() -> dict:
    return {
        "planner": config.RESEARCH_MODEL,
        "researcher": config.RESEARCH_MODEL,
        "judge": config.RESEARCH_MODEL,
        "synthesizer": config.RESEARCH_SYNTH_MODEL,
    }


def stream_research(
    request: dict,
    *,
    deps=None,
    writer: RunWriter | None = None,
    model_set: dict | None = None,
    graph=None,
) -> Iterator[str]:
    writer = writer or RunWriter()
    if graph is None:
        graph = build_research_graph(deps or build_research_deps())
    model_set = model_set or _default_model_set()

    yield sse.sse_start()
    run_id = writer.start_run(request, model_set)
    writer.add_step(run_id, seq=0, role="planner", input=request)

    view = {"cursor": 0, "subtasks": [], "retries": 0, "tool_calls": 0}
    report: dict | None = None
    status = "done"
    try:
        for chunk in graph.stream({"request": request}, stream_mode="updates"):
            for node, delta in chunk.items():
                if isinstance(delta, dict):
                    if delta.get("subtasks") is not None:
                        view["subtasks"] = delta["subtasks"]
                    if delta.get("retries") is not None:
                        view["retries"] = delta["retries"]
                    if delta.get("tool_calls") is not None:
                        view["tool_calls"] = delta["tool_calls"]
                label = label_for(node, delta, view)
                if node == "advance" and isinstance(delta, dict):
                    view["cursor"] = delta.get("cursor", view["cursor"] + 1)
                if label:
                    yield sse.sse_data_status(label, node)
                if node == "synthesize" and isinstance(delta, dict):
                    report = delta.get("report")
                    status = delta.get("status", "done")
    except Exception as exc:
        logger.exception("streamed research failed")
        writer.fail_run(run_id, str(exc))
        yield sse.sse_data_status("Run failed", "error")
        yield sse.sse_data_report(None, "error")
        yield sse.sse_finish({"status": "error"})
        yield sse.sse_done()
        return

    final_state = {
        "subtasks": view["subtasks"],
        "retries": view["retries"],
        "tool_calls": view["tool_calls"],
        "status": status,
        "report": report,
    }
    try:
        persist_steps(writer, run_id, final_state)
    except Exception:
        logger.exception("research persistence failed (continuing)")

    yield sse.sse_data_report(report, status)
    yield sse.sse_finish({"status": status})
    yield sse.sse_done()
