"""Streaming runner: drive triage → retrieval/tool → live draft token streaming.

Replaces the old blocking `graph.invoke` + single-delta emission. Two reasons it
lives here rather than in the compiled graph:

1. Real token streaming — the draft is emitted token-by-token as the model
   produces it, so the browser sees text immediately instead of a long blank gap.
2. The groundedness gate runs BEFORE drafting. The graph's review_node retracted
   an ungrounded draft *after* generation; you cannot un-stream tokens, so the
   gate must decide before the first delta is sent.

Status updates are emitted as transient `data-status` parts so the client can
show what the model is doing (routing → searching → writing).
"""

from __future__ import annotations

import json
import logging
from typing import Callable, Iterator

from app import stream as sse
from app.config import TRIAGE_CONFIDENCE_THRESHOLD
from app.graph.nodes import (
    CONTACT_PERSONA,
    PERSONAS,
    SCHEDULER_PERSONA,
    VALID_INTENTS,
    TriageResult,
    _last_user_text,
)
from app.lead import (
    CONNECT_OFFER,
    ESCALATED_OFFER,
    NEUTRAL_FALLBACK,
    SOFT_OFFER,
    confirm,
    extract_contact,
    format_contact,
    has_prior_confirm,
    most_recent_offer_trigger,
    prior_offer_made,
    prior_user_question,
)
from app.retriever import RetrievalResult

logger = logging.getLogger(__name__)

_TEXT_ID = "0"

# (system, messages, context) -> stream of text deltas
DraftStreamFn = Callable[[str, list[dict], str], Iterator[str]]
TriageFn = Callable[[list[dict]], TriageResult]


def _emit_static(text: str, metadata: dict) -> Iterator[str]:
    """Emit a complete, fixed answer (clarification / fallback) through the same
    UI-message-stream shape the live path uses."""
    yield sse.sse_start(metadata)
    yield sse.sse_text_start(_TEXT_ID)
    yield sse.sse_text_delta(_TEXT_ID, text)
    yield sse.sse_text_end(_TEXT_ID)
    yield sse.sse_finish(metadata)
    yield sse.sse_done()


def run_stream(
    messages: list[dict],
    *,
    triage_fn: TriageFn,
    retriever_retrieve: Callable[[str], RetrievalResult],
    draft_stream_fn: DraftStreamFn,
    schedule_fn: Callable[[], dict],
    contact_fn: Callable[[], dict],
    corpus_version_fn: Callable[[], "int | None"] = lambda: None,
    knowledge_system: str | None = None,
    scheduler_system: str | None = None,
    contact_system: str | None = None,
    persona_prefix: str = "",
) -> Iterator[str]:
    # Ordered record of the pipeline steps taken this turn. Each `status` emit
    # both streams a transient data-status part (drives the live checklist) and
    # appends the label here, so the terminal metadata can carry the full,
    # persisted "How I answered" trace.
    steps: list[str] = []
    corpus_version = corpus_version_fn()

    def status(label: str, stage: str) -> str:
        steps.append(label)
        return sse.sse_data_status(label, stage)

    # --- Capture path: visitor supplied contact info → record + confirm. -----
    contact = extract_contact(_last_user_text(messages))
    if contact:
        yield status("Saving your contact…", "capture")
        lead = {
            **contact,
            "triggerQuestion": prior_user_question(messages),
            "trigger": most_recent_offer_trigger(messages) or "provided",
        }
        yield from _emit_static(
            confirm(contact),
            {
                "sources": [],
                "route": "lead",
                "intent": "lead",
                "steps": list(steps),
                "lead": lead,
                "corpus_version": corpus_version,
            },
        )
        return

    yield status("Routing your question…", "triage")
    triage = triage_fn(messages)
    intent = triage.intent if triage.intent in VALID_INTENTS else "general"

    # Don't nag for contact again once it's been captured this conversation.
    suppress = has_prior_confirm(messages)

    def fallback_text() -> str:
        if suppress:
            return NEUTRAL_FALLBACK
        return ESCALATED_OFFER if prior_offer_made(messages) else SOFT_OFFER

    # Low confidence: ask the SPECIFIC clarifying question if the router gave one
    # (good UX); otherwise the generic dead-end becomes a capture offer.
    if triage.confidence < TRIAGE_CONFIDENCE_THRESHOLD:
        text = triage.clarifying_question or fallback_text()
        yield from _emit_static(
            text,
            {
                "sources": [],
                "route": "respond",
                "intent": intent,
                "steps": list(steps),
                "corpus_version": corpus_version,
            },
        )
        return

    if intent == "scheduler":
        yield status("Pulling up booking details…", "scheduler")
        context = json.dumps(schedule_fn())
        system = scheduler_system or SCHEDULER_PERSONA
        sources: list[dict] = []
    elif intent == "contact":
        yield status("Pulling up contact details…", "contact")
        context = json.dumps(contact_fn())
        system = contact_system or CONTACT_PERSONA
        sources = []
    else:
        # tech | project | general all retrieve from the knowledge base.
        yield status("Searching knowledge base…", "retrieval")
        try:
            retrieval = retriever_retrieve(_last_user_text(messages))
        except Exception:
            logger.warning("Retrieval failed; falling back", exc_info=True)
            retrieval = RetrievalResult(chunks=[], sources=[])
        if not retrieval.chunks:
            # Groundedness gate — no supporting chunks. Instead of a blunt dead
            # end, offer to capture contact (or stay neutral if already captured).
            yield from _emit_static(
                fallback_text(),
                {
                    "sources": [],
                    "route": intent,
                    "intent": intent,
                    "steps": list(steps),
                    "corpus_version": corpus_version,
                },
            )
            return
        context = "\n\n".join(chunk.text for chunk in retrieval.chunks)
        system = knowledge_system or PERSONAS.get(intent, PERSONAS["general"])
        sources = retrieval.sources

    # Apply persona prefix if configured
    if persona_prefix:
        system = f"{persona_prefix}\n\n{system}"

    yield status("Writing the answer…", "drafting")
    metadata = {
        "sources": sources,
        "route": intent,
        "intent": intent,
        "steps": list(steps),
        "corpus_version": corpus_version,
    }
    yield sse.sse_start(metadata)
    yield sse.sse_text_start(_TEXT_ID)
    for delta in draft_stream_fn(system, messages, context):
        if delta:
            yield sse.sse_text_delta(_TEXT_ID, delta)
    # Connect-intent answers invite the visitor to leave their own contact too.
    if intent in ("scheduler", "contact") and not suppress:
        yield sse.sse_text_delta(_TEXT_ID, "\n\n" + CONNECT_OFFER)
    yield sse.sse_text_end(_TEXT_ID)
    yield sse.sse_finish(metadata)
    yield sse.sse_done()
