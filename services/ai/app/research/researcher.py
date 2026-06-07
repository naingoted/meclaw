"""Researcher (Spec C §4 U2): execute one subtask in a bounded ReAct loop using
the ToolCaller seam. Returns a structured note {text, sources, tool_calls}. The
loop is hard-capped at max_steps (loop guard) regardless of model behavior."""

from __future__ import annotations

import json
import logging
from typing import Callable

from app.research.tool_caller import Proposal, Tool, ToolCaller, dispatch

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a researcher gathering evidence for one subtask. Use the available "
    "tools to find concrete facts. When you have enough, finish with a concise note "
    "that cites what you found. Do not invent facts."
)


def _collect_sources(result) -> list[dict]:
    """Pull source refs from a tool result (corpus chunks, search results)."""
    sources: list[dict] = []
    if isinstance(result, dict):
        for item in result.get("results", []) or []:
            if isinstance(item, dict) and (item.get("source") or item.get("url")):
                sources.append(item)
    return sources


def make_researcher(
    tool_caller: ToolCaller, tools: list[Tool], *, max_steps: int
) -> Callable[[dict], dict]:
    def _run(subtask: dict) -> dict:
        messages: list[dict] = [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": f"Subtask ({subtask.get('source')}): {subtask.get('query')}",
            },
        ]
        sources: list[dict] = []
        used = 0
        content = ""
        for _ in range(max_steps):
            prop: Proposal = tool_caller.propose(messages, tools)
            if not prop.calls:
                content = prop.content
                break
            for call in prop.calls:
                result = dispatch(call, tools)
                used += 1
                sources.extend(_collect_sources(result))
                messages.append(
                    {
                        "role": "user",
                        "content": f"Observation from {call.name}: {json.dumps(result)[:2000]}",
                    }
                )
        else:
            # Hit the step cap with tools still pending — ask once for a final note.
            try:
                final = tool_caller.propose(
                    messages + [{"role": "user", "content": "Stop. Give your final note now."}],
                    [],
                )
                content = final.content
            except Exception:  # noqa: BLE001
                content = ""
        return {"text": content, "sources": sources, "tool_calls": used}

    return _run
