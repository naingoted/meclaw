"""LangGraph nodes. Each node is a pure-ish function of GraphState returning a
partial state update. External calls (LLM, retriever, tools) are injected so
tests never hit live services."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel, Field

from app.config import OWNER_NAME, TRIAGE_CONFIDENCE_THRESHOLD
from app.graph.state import GraphState
from app.retriever import RetrievalResult

logger = logging.getLogger(__name__)


def _extract_text(content) -> str:
    """Flatten a model response's content to plain text. Thinking-mode models
    return a list of blocks; keep only text blocks (drop thinking)."""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


VALID_INTENTS = {"tech", "project", "scheduler", "contact", "general"}


@dataclass(frozen=True)
class TriageResult:
    intent: str
    confidence: float
    clarifying_question: str | None


class _TriageSchema(BaseModel):
    intent: str = Field(
        description="One of: tech, project, scheduler, contact, general"
    )
    confidence: float = Field(description="0.0-1.0 confidence in the intent")
    clarifying_question: str | None = Field(
        default=None,
        description="If the question is ambiguous, a single question to ask back.",
    )


TRIAGE_SYSTEM = (
    f"You are a triage router for a chatbot answering questions about {OWNER_NAME}. "
    "Classify the latest user message into exactly one intent: tech (skills, "
    f"stack, technical work), project (specific projects/case studies), scheduler "
    f"(booking a call/meeting), contact (how to reach {OWNER_NAME}), or general (anything "
    f"else about {OWNER_NAME}). Return your confidence 0-1. If the message is too vague to "
    "route, set a low confidence and provide a single clarifying_question."
)

TRIAGE_JSON_INSTRUCTION = (
    " Respond with ONLY a JSON object, no prose and no code fence: "
    '{"intent": "<tech|project|scheduler|contact|general>", '
    '"confidence": <0.0-1.0>, "clarifying_question": <string or null>}.'
)


def _last_user_text(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content", ""))
    return ""


def default_triage_fn(
    triage_model, system: str | None = None
) -> Callable[[list[dict]], TriageResult]:
    """Build a triage function that prompts for JSON and parses the response.

    Uses JSON prompting instead of with_structured_output to work with thinking-mode
    models that reject forced-tool structured output. Extracts text from content blocks
    to handle models that return lists of blocks instead of plain strings.

    Args:
        triage_model: The LLM to use for triage.
        system: Optional override system prompt (replaces TRIAGE_SYSTEM). Defaults to None.
    """

    def _run(messages: list[dict]) -> TriageResult:
        text = ""
        try:
            base = system or TRIAGE_SYSTEM
            response = triage_model.invoke(
                [{"role": "system", "content": base + TRIAGE_JSON_INSTRUCTION}]
                + messages
            )
            text = _extract_text(response.content).strip()
            # Find the first {...} JSON object in the text (tolerates code fences/prose)
            match = re.search(r"\{.*\}", text, re.DOTALL)
            parsed = json.loads(match.group(0) if match else text)
            schema = _TriageSchema(**parsed)
        except Exception as exc:
            # A parse failure is a router fault, not user ambiguity. Don't dead-end
            # a clear question with a generic clarify prompt — degrade to the general
            # route (clarifying_question=None) so the question still gets a grounded
            # answer attempt. review_node guards against hallucination if retrieval
            # comes back empty. Keep the log to one line; full traceback at debug.
            snippet = text[:200] if text else "<empty>"
            logger.warning(
                "Triage parse failed (%s); routing to general. Raw: %r", exc, snippet
            )
            logger.debug("Triage parse traceback", exc_info=True)
            return TriageResult(
                intent="general",
                confidence=0.0,
                clarifying_question=None,
            )
        intent = schema.intent if schema.intent in VALID_INTENTS else "general"
        return TriageResult(
            intent=intent,
            confidence=schema.confidence,
            clarifying_question=schema.clarifying_question,
        )

    return _run


def triage_node(
    state: GraphState,
    triage_fn: Callable[[list[dict]], TriageResult],
) -> GraphState:
    triage = triage_fn(state["messages"])

    # Only ask the user to clarify when the router is unsure AND it produced a
    # specific question worth asking. Low confidence with no question (e.g. a
    # parse failure degraded to general) routes best-effort instead of dead-ending
    # on a generic "tell me more about Thet" prompt.
    if triage.confidence < TRIAGE_CONFIDENCE_THRESHOLD and triage.clarifying_question:
        return {
            "intent": triage.intent,
            "confidence": triage.confidence,
            "needs_clarification": True,
            "clarifying_question": triage.clarifying_question,
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
        return _extract_text(response.content)

    return _run


def default_draft_stream_fn(chat_model):
    """Build a (system, messages, context) -> Iterator[str] streaming drafter.

    Yields text deltas as the model produces them. Thinking-mode models emit
    block-list chunks; `_extract_text` drops thinking and keeps only text, so
    reasoning never leaks into the user-visible stream."""

    def _run(system: str, messages: list[dict], context: str):
        system_with_context = f"{system}\n\nContext:\n{context}" if context else system
        for chunk in chat_model.stream(
            [{"role": "system", "content": system_with_context}] + messages
        ):
            text = _extract_text(chunk.content)
            if text:
                yield text

    return _run


# --- Persona system prompts -------------------------------------------------

PERSONAS = {
    "tech": (
        f"You answer in a warm third-person voice about {OWNER_NAME}'s technical skills and "
        "stack. Ground every claim in the provided context. If the context is empty, "
        "say you're not certain and suggest reaching out directly."
    ),
    "project": (
        f"You answer about {OWNER_NAME}'s specific projects in a warm third-person voice. "
        "Ground claims in the provided context; do not invent project details."
    ),
    "general": (
        f"You answer general questions about {OWNER_NAME} in a warm third-person voice, "
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
    try:
        retrieval = retriever_retrieve(query)
    except Exception:
        # RAG backend (Qdrant/Ollama) unavailable — degrade gracefully to an
        # ungrounded answer rather than failing the whole request. review_node
        # converts an ungrounded knowledge answer into the safe fallback text.
        logger.warning("Retrieval failed; continuing without context", exc_info=True)
        retrieval = RetrievalResult(chunks=[], sources=[])
    context = "\n\n".join(chunk.text for chunk in retrieval.chunks)
    draft = draft_fn(
        PERSONAS.get(persona, PERSONAS["general"]), state["messages"], context
    )
    return {
        "retrieved_chunks": list(retrieval.chunks),
        "sources": retrieval.sources,
        "draft": draft,
    }


SCHEDULER_PERSONA = (
    f"The visitor wants to schedule a call with {OWNER_NAME}. Use the booking link in the "
    "context. Be warm and concise; include the link."
)

CONTACT_PERSONA = (
    f"The visitor wants {OWNER_NAME}'s contact details. Use the contact info in the context. "
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
    "naingoted@gmail.com, and he'll be happy to help."
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
