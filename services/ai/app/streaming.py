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
from app.answer_gap import is_missing_fact_answer
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
    corpus_version_fn: Callable[[], int | None] = lambda: None,
    knowledge_system: str | None = None,
    scheduler_system: str | None = None,
    contact_system: str | None = None,
    persona_prefix: str = "",
    score_floor: float = 0.0,
    score_threshold: float = 0.0,
    tiny_corpus_threshold: int = 0,
    triage_confidence: float = TRIAGE_CONFIDENCE_THRESHOLD,
    corpus_text_fn: Callable[[], tuple[str, int]] | None = None,
    embed_fn: Callable[[str], list[float]] | None = None,
    assign_cluster_fn: Callable[[list[float], str], str] | None = None,
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

    query = _last_user_text(messages)

    def detect_miss(reason: str, top_score: float | None) -> dict | None:
        """Best-effort: embed the query + fold it into a gap cluster. Returns the
        miss metadata dict, or None if clustering is unavailable — so the Next
        flush skips chat_misses rather than write a row with no clusterId.
        Misses are off the hot path (no LLM draft), so the extra embed is cheap."""
        if embed_fn is None or assign_cluster_fn is None:
            return None
        try:
            embedding = embed_fn(query)
            cluster_id = assign_cluster_fn(embedding, query)
        except Exception:
            logger.warning("Gap clustering failed; miss not recorded", exc_info=True)
            return None
        return {"reason": reason, "topScore": top_score, "clusterId": cluster_id}

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

    # Non-None only on a grounded non-tool route → eligible for answer-gap detection.
    answer_gap_score: float | None = None

    def fallback_text() -> str:
        if suppress:
            return NEUTRAL_FALLBACK
        return ESCALATED_OFFER if prior_offer_made(messages) else SOFT_OFFER

    # Low confidence: ask the SPECIFIC clarifying question if the router gave one
    # (good UX); otherwise the generic dead-end becomes a capture offer.
    if triage.confidence < triage_confidence:
        text = triage.clarifying_question or fallback_text()
        yield from _emit_static(
            text,
            {
                "sources": [],
                "route": "respond",
                "intent": intent,
                "steps": list(steps),
                "corpus_version": corpus_version,
                "miss": detect_miss("clarify", None),
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
        # Tiny-corpus shortcut: if the whole corpus is smaller than the
        # threshold, skip retrieval and stuff it all into context. Guard on
        # token_count > 0 so an empty/unavailable corpus falls through to normal
        # retrieval instead of stuffing an empty context.
        stuffed = False
        if corpus_text_fn is not None and tiny_corpus_threshold > 0:
            full_text, token_count = corpus_text_fn()
            if 0 < token_count < tiny_corpus_threshold:
                yield status("Using full corpus…", "retrieval")
                context = full_text
                system = knowledge_system or PERSONAS.get(intent, PERSONAS["general"])
                sources = []
                stuffed = True

        if not stuffed:
            yield status("Searching knowledge base…", "retrieval")
            try:
                retrieval = retriever_retrieve(query)
            except Exception:
                logger.warning("Retrieval failed; falling back", exc_info=True)
                retrieval = RetrievalResult(chunks=[], sources=[])
            # Per-chunk include filter: drop sub-threshold chunks BEFORE the gate.
            # Distinct from score_floor, which gates grounded-vs-miss on the
            # surviving top score.
            kept = [c for c in retrieval.chunks if c.score >= score_threshold]
            top_score = max((c.score for c in kept), default=0.0)
            grounded = bool(kept) and top_score >= score_floor
            if not grounded:
                # Groundedness gate — no usable chunks, or top hit below the floor.
                reason = "fallback" if not kept else "floor"
                yield from _emit_static(
                    fallback_text(),
                    {
                        "sources": [],
                        "route": intent,
                        "intent": intent,
                        "steps": list(steps),
                        "corpus_version": corpus_version,
                        "miss": detect_miss(reason, None if not kept else top_score),
                    },
                )
                return
            context = "\n\n".join(chunk.text for chunk in kept)
            system = knowledge_system or PERSONAS.get(intent, PERSONAS["general"])
            kept_sources = {c.source for c in kept}
            sources = [s for s in retrieval.sources if s.get("source") in kept_sources]
            # Grounded retrieval route → eligible for answer-gap detection. The
            # tiny-corpus stuffed path above has no per-chunk score, so it stays
            # out (answer_gap_score remains None there).
            answer_gap_score = top_score

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
        "miss": None,
    }
    yield sse.sse_start(metadata)
    yield sse.sse_text_start(_TEXT_ID)
    draft_text = ""
    for delta in draft_stream_fn(system, messages, context):
        if delta:
            draft_text += delta
            yield sse.sse_text_delta(_TEXT_ID, delta)
    # Answer-level missing-fact signal: retrieval passed the floor but the draft
    # admits the fact isn't actually present. Non-tool grounded routes only; we
    # don't retract the streamed answer, just record the gap in terminal metadata.
    if answer_gap_score is not None and is_missing_fact_answer(draft_text):
        metadata["miss"] = detect_miss("answer_gap", answer_gap_score)
    # Connect-intent answers invite the visitor to leave their own contact too.
    if intent in ("scheduler", "contact") and not suppress:
        yield sse.sse_text_delta(_TEXT_ID, "\n\n" + CONNECT_OFFER)
    yield sse.sse_text_end(_TEXT_ID)
    yield sse.sse_finish(metadata)
    yield sse.sse_done()
