"""Tool seam for the researcher's ReAct loop. A Tool is source-agnostic (MCP or
web). A ToolCaller proposes the next tool call(s) from the model; two impls cover
the §7.1 outcomes: JsonToolCaller (prompt the model for tool-call JSON — works on
any gateway) and NativeToolCaller (bind_tools, when the gateway supports it).

JSON parsing reuses the tolerant approach in app/graph/nodes.py (first {...} blob,
code-fence/prose tolerant)."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args_schema: dict  # JSON-schema-ish {field: type} — for the model prompt / bind
    run: Callable[[dict], Any]


@dataclass(frozen=True)
class ToolCall:
    name: str
    args: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Proposal:
    calls: list[ToolCall]  # empty => the model is done; `content` is the note
    content: str


def _extract_text(content) -> str:
    """Flatten a model response to text (thinking-mode models emit block lists).
    Mirrors app/graph/nodes.py:_extract_text."""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content or []:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


_TOOLCALL_INSTRUCTION = (
    " You may call ONE tool at a time. Respond with ONLY a JSON object, no prose "
    'and no code fence. To call a tool: {"tool": "<name>", "args": {...}}. '
    'When you have enough to answer the subtask: {"done": true, "answer": "<note>"}.'
)


class ToolCaller(Protocol):
    def propose(self, messages: list[dict], tools: list[Tool]) -> Proposal: ...


class JsonToolCaller:
    """Prompt-driven tool calling. Safe on any Anthropic-compatible gateway."""

    def __init__(self, model):
        self._model = model

    def propose(self, messages: list[dict], tools: list[Tool]) -> Proposal:
        catalog = "\n".join(f"- {t.name}{t.args_schema}: {t.description}" for t in tools)
        system = {
            "role": "system",
            "content": ("Available tools:\n" + catalog + _TOOLCALL_INSTRUCTION),
        }
        text = ""
        try:
            resp = self._model.invoke([system, *messages])
            text = _extract_text(resp.content).strip()
            match = re.search(r"\{.*\}", text, re.DOTALL)
            parsed = json.loads(match.group(0) if match else text)
        except Exception as exc:  # parse/transport fault → degrade to done
            logger.warning("ToolCaller parse failed (%s); finishing. Raw: %r", exc, text[:200])
            return Proposal(calls=[], content=text)
        if parsed.get("done"):
            return Proposal(calls=[], content=str(parsed.get("answer", "")))
        name = parsed.get("tool")
        if not name:
            return Proposal(calls=[], content=text)
        return Proposal(calls=[ToolCall(name=str(name), args=dict(parsed.get("args") or {}))], content="")


class NativeToolCaller:
    """Gateway-native tool calling via bind_tools. Use only when the §7.1 spike
    verdict is PASS. Each Tool is advertised as a langchain StructuredTool-style
    spec; we read resp.tool_calls back.

    NOTE: verify against the installed langchain-anthropic — `bind_tools` accepts
    a list of tool specs and the response exposes `.tool_calls` as
    [{name, args, id}]. If the installed version differs, adapt the spec shape
    here only; the researcher loop is unaffected."""

    def __init__(self, model):
        self._model = model

    def _specs(self, tools: list[Tool]) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "parameters": {
                    "type": "object",
                    "properties": {k: {"type": "string"} for k in t.args_schema},
                },
            }
            for t in tools
        ]

    def propose(self, messages: list[dict], tools: list[Tool]) -> Proposal:
        bound = self._model.bind_tools(self._specs(tools))
        resp = bound.invoke(messages)
        calls = [
            ToolCall(name=tc["name"], args=dict(tc.get("args") or {}))
            for tc in (getattr(resp, "tool_calls", None) or [])
        ]
        return Proposal(calls=calls, content=_extract_text(resp.content) if not calls else "")


def dispatch(call: ToolCall, tools: list[Tool]) -> Any:
    """Run a proposed tool call against the tool list."""
    for tool in tools:
        if tool.name == call.name:
            try:
                return tool.run(call.args)
            except Exception as exc:  # tool faults are observations, not crashes
                logger.warning("Tool %s failed: %s", call.name, exc)
                return {"error": f"tool {call.name} failed: {exc}"}
    return {"error": f"unknown tool {call.name!r}"}


def make_tool_caller(model, mode: str) -> ToolCaller:
    """Select the ToolCaller from config.RESEARCH_TOOLCALL_MODE."""
    return NativeToolCaller(model) if mode == "native" else JsonToolCaller(model)
