"""Headless entrypoint for the research/briefing pipeline (Spec C). Assembles the
real dependencies (models via provider.py, MCP operator tools, web tools) into a
ResearchDeps, runs the graph, and persists the run + steps. C-2 wraps this with an
SSE endpoint + admin UI; here it is callable directly and from the CLI.

Step logging: the graph nodes don't write to the DB (they stay pure/testable);
run_research records coarse step rows (planner/synthesizer + per-subtask
researcher/validate summaries) around the graph invoke, mirroring the
gap_clusters disjoint-writer posture (sidecar owns the writes)."""

from __future__ import annotations

import argparse
import json
import logging

from app import config
from app.provider import get_chat_model
from app.research.graph import ResearchBudget, ResearchDeps, build_research_graph
from app.research.mcp_client import load_operator_tools
from app.research.persist import RunWriter
from app.research.planner import make_planner, make_replanner
from app.research.researcher import make_researcher
from app.research.synthesize import make_synthesizer
from app.research.tool_caller import make_tool_caller
from app.research.validate import make_validator
from app.research.web_tools import build_web_tools

logger = logging.getLogger(__name__)


def build_research_deps() -> ResearchDeps:
    """Wire production ResearchDeps from config + the provider seam."""
    reasoning = get_chat_model(config.RESEARCH_MODEL, streaming=False, thinking=False)
    synth = get_chat_model(config.RESEARCH_SYNTH_MODEL, streaming=False, thinking=False)

    tools = load_operator_tools() + build_web_tools()
    tool_caller = make_tool_caller(reasoning, config.RESEARCH_TOOLCALL_MODE)

    return ResearchDeps(
        plan_fn=make_planner(reasoning, max_subtasks=config.RESEARCH_MAX_SUBTASKS),
        research_fn=make_researcher(tool_caller, tools, max_steps=config.RESEARCH_REACT_MAX_STEPS),
        replan_fn=make_replanner(reasoning),
        validate_fn=make_validator(
            reasoning,
            min_chars=config.RESEARCH_MIN_NOTE_CHARS,
            judge_threshold=config.RESEARCH_JUDGE_THRESHOLD,
            corpus_score_floor=config.RESEARCH_CORPUS_SCORE_FLOOR,
        ),
        synth_fn=lambda request, notes: make_synthesizer(synth)(request, notes).model_dump(),
        budget=ResearchBudget(
            max_subtasks=config.RESEARCH_MAX_SUBTASKS,
            retry_budget=config.RESEARCH_RETRY_BUDGET,
            max_iterations=config.RESEARCH_MAX_ITERATIONS,
            max_tool_calls=config.RESEARCH_MAX_TOOL_CALLS,
        ),
    )


def eval_records(state: dict) -> list[dict]:
    """Ragas-scorable triples from resolved subtasks (Spec B soft dep)."""
    records = []
    for sub in state.get("subtasks", []):
        note = sub.get("note") or {}
        if sub.get("status") == "resolved" and note.get("text"):
            records.append(
                {
                    "question": sub.get("query"),
                    "contexts": [
                        str(s.get("source") or s.get("url"))
                        for s in note.get("sources", [])
                        if isinstance(s, dict)
                    ],
                    "answer": note.get("text"),
                }
            )
    return records


def persist_steps(writer: RunWriter, run_id: str, state: dict) -> None:
    """Write per-subtask researcher/validate steps, the synthesizer step, and the
    finishing UPDATE for one completed run. Shared by the headless runner
    (run_research) and the C-2 streaming runner. Step rows mirror Spec C §8."""
    seq = 1
    for sub in state.get("subtasks", []):
        writer.add_step(
            run_id,
            seq=seq,
            role="researcher",
            input={"query": sub.get("query"), "source": sub.get("source")},
            output=sub.get("note"),
            tool_calls=[{"name": "*", "resultDigest": "see note.sources"}],
            retry_index=sub.get("retry_count"),
        )
        seq += 1
        writer.add_step(
            run_id,
            seq=seq,
            role="validate",
            input={"query": sub.get("query")},
            output={"status": sub.get("status")},
            verdict=sub.get("verdict"),
            score=sub.get("score"),
            retry_index=sub.get("retry_count"),
        )
        seq += 1
    writer.add_step(run_id, seq=seq, role="synthesizer", output=state.get("report"))
    writer.finish_run(
        run_id,
        status=state.get("status", "done"),
        report=state.get("report"),
        eval_records=eval_records(state),
        totals={
            "subtasks": len(state.get("subtasks", [])),
            "retries": state.get("retries", 0),
            "toolCalls": state.get("tool_calls", 0),
            "tokens": 0,
        },
    )


def run_research(
    request: dict,
    *,
    deps: ResearchDeps | None = None,
    writer: RunWriter | None = None,
    model_set: dict | None = None,
) -> dict:
    """Run one briefing end to end. Returns the final ResearchState dict."""
    deps = deps or build_research_deps()
    writer = writer or RunWriter()
    model_set = model_set or {
        "planner": config.RESEARCH_MODEL,
        "researcher": config.RESEARCH_MODEL,
        "judge": config.RESEARCH_MODEL,
        "synthesizer": config.RESEARCH_SYNTH_MODEL,
    }

    run_id = writer.start_run(request, model_set)
    writer.add_step(run_id, seq=0, role="planner", input=request)
    try:
        state = build_research_graph(deps).invoke({"request": request})
    except Exception as exc:  # any unexpected fault → mark errored, re-raise nothing
        logger.exception("research run failed")
        writer.fail_run(run_id, str(exc))
        return {"status": "error", "report": None, "error": str(exc)}

    persist_steps(writer, run_id, state)
    return state


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Run a briefing (Spec C headless).")
    parser.add_argument("--company")
    parser.add_argument("--role")
    parser.add_argument("--jd")
    args = parser.parse_args()
    request = {k: v for k, v in vars(args).items() if v}
    state = run_research(request)
    print(json.dumps(state.get("report"), indent=2))


if __name__ == "__main__":
    main()
