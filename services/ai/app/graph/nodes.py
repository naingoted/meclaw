"""LangGraph nodes. Each node is a pure-ish function of GraphState returning a
partial state update. External calls (LLM, retriever, tools) are injected so
tests never hit live services."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel, Field

from app.config import TRIAGE_CONFIDENCE_THRESHOLD
from app.graph.state import GraphState

VALID_INTENTS = {"tech", "project", "scheduler", "contact", "general"}


@dataclass(frozen=True)
class TriageResult:
    intent: str
    confidence: float
    clarifying_question: str | None


class _TriageSchema(BaseModel):
    intent: str = Field(description="One of: tech, project, scheduler, contact, general")
    confidence: float = Field(description="0.0-1.0 confidence in the intent")
    clarifying_question: str | None = Field(
        default=None,
        description="If the question is ambiguous, a single question to ask back.",
    )


TRIAGE_SYSTEM = (
    "You are a triage router for a chatbot answering questions about Thet. "
    "Classify the latest user message into exactly one intent: tech (skills, "
    "stack, technical work), project (specific projects/case studies), scheduler "
    "(booking a call/meeting), contact (how to reach Thet), or general (anything "
    "else about Thet). Return your confidence 0-1. If the message is too vague to "
    "route, set a low confidence and provide a single clarifying_question."
)


def _last_user_text(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content", ""))
    return ""


def default_triage_fn(triage_model) -> Callable[[list[dict]], TriageResult]:
    """Build a triage function bound to an LLM with structured output."""
    structured = triage_model.with_structured_output(_TriageSchema)

    def _run(messages: list[dict]) -> TriageResult:
        result: _TriageSchema = structured.invoke(
            [{"role": "system", "content": TRIAGE_SYSTEM}] + messages
        )
        intent = result.intent if result.intent in VALID_INTENTS else "general"
        return TriageResult(
            intent=intent,
            confidence=result.confidence,
            clarifying_question=result.clarifying_question,
        )

    return _run


def triage_node(
    state: GraphState,
    triage_fn: Callable[[list[dict]], TriageResult],
) -> GraphState:
    triage = triage_fn(state["messages"])

    if triage.confidence < TRIAGE_CONFIDENCE_THRESHOLD:
        question = (
            triage.clarifying_question
            or "Could you tell me a bit more about what you'd like to know about Thet?"
        )
        return {
            "intent": triage.intent,
            "confidence": triage.confidence,
            "needs_clarification": True,
            "clarifying_question": question,
            "route": "respond",
        }

    return {
        "intent": triage.intent,
        "confidence": triage.confidence,
        "needs_clarification": False,
        "route": triage.intent,
    }
