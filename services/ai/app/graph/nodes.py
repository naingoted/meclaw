"""LangGraph nodes. Each node is a pure-ish function of GraphState returning a
partial state update. External calls (LLM, retriever, tools) are injected so
tests never hit live services."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel, Field

from app.config import TRIAGE_CONFIDENCE_THRESHOLD
from app.graph.state import GraphState
from app.retriever import RetrievalResult

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


# --- Drafting ---------------------------------------------------------------

DraftFn = Callable[[str, list[dict], str], str]  # (system, messages, context) -> text


def default_draft_fn(chat_model) -> DraftFn:
    def _run(system: str, messages: list[dict], context: str) -> str:
        system_with_context = f"{system}\n\nContext:\n{context}" if context else system
        response = chat_model.invoke(
            [{"role": "system", "content": system_with_context}] + messages
        )
        return response.content if isinstance(response.content, str) else str(response.content)

    return _run


# --- Persona system prompts -------------------------------------------------

PERSONAS = {
    "tech": (
        "You answer in a warm third-person voice about Thet's technical skills and "
        "stack. Ground every claim in the provided context. If the context is empty, "
        "say you're not certain and suggest reaching out directly."
    ),
    "project": (
        "You answer about Thet's specific projects in a warm third-person voice. "
        "Ground claims in the provided context; do not invent project details."
    ),
    "general": (
        "You answer general questions about Thet in a warm third-person voice, "
        "grounded in the provided context."
    ),
}


def knowledge_node(
    state: GraphState,
    retriever_retrieve: Callable[[str], RetrievalResult],
    draft_fn: DraftFn,
    persona: str,
) -> GraphState:
    query = _last_user_text(state["messages"])
    retrieval = retriever_retrieve(query)
    context = "\n\n".join(chunk.text for chunk in retrieval.chunks)
    draft = draft_fn(PERSONAS.get(persona, PERSONAS["general"]), state["messages"], context)
    return {
        "retrieved_chunks": list(retrieval.chunks),
        "sources": retrieval.sources,
        "draft": draft,
    }


SCHEDULER_PERSONA = (
    "The visitor wants to schedule a call with Thet. Use the booking link in the "
    "context. Be warm and concise; include the link."
)

CONTACT_PERSONA = (
    "The visitor wants Thet's contact details. Use the contact info in the context. "
    "Be warm and concise; include the email (and GitHub if present)."
)


def scheduler_node(
    state: GraphState,
    schedule_fn: Callable[[], dict],
    draft_fn: DraftFn,
) -> GraphState:
    context = json.dumps(schedule_fn())
    draft = draft_fn(SCHEDULER_PERSONA, state["messages"], context)
    return {"draft": draft, "sources": [], "retrieved_chunks": []}


def contact_node(
    state: GraphState,
    contact_fn: Callable[[], dict],
    draft_fn: DraftFn,
) -> GraphState:
    context = json.dumps(contact_fn())
    draft = draft_fn(CONTACT_PERSONA, state["messages"], context)
    return {"draft": draft, "sources": [], "retrieved_chunks": []}


# --- Review (groundedness check) --------------------------------------------

FALLBACK_TEXT = (
    "I'm not certain about that one. You can reach Thet directly at "
    "thetnaing@incube8.sg, and he'll be happy to help."
)

# Intents whose answers come from tools, not retrieval — empty chunks is expected.
_TOOL_INTENTS = {"scheduler", "contact"}


def review_node(state: GraphState) -> GraphState:
    if state.get("needs_clarification"):
        return {}  # clarification handled by respond; nothing to review

    draft = state.get("draft") or ""
    intent = state.get("intent")
    has_retrieval = bool(state.get("retrieved_chunks"))

    if not has_retrieval and intent not in _TOOL_INTENTS and len(draft.strip()) > 0:
        # Knowledge answer with no supporting chunks — don't risk a hallucinated fact.
        return {"draft": FALLBACK_TEXT}

    return {"draft": draft}
