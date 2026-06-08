"""Emit the Vercel AI-SDK UI-message-stream protocol as SSE. Shapes verified
against the installed `ai` package (see scripts/capture-ui-stream.mjs)."""

import json

SSE_HEADERS = {
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "content-type": "text/event-stream",
    "x-accel-buffering": "no",
    "x-vercel-ai-ui-message-stream": "v1",
}


def _frame(part: dict) -> str:
    return f"data: {json.dumps(part, separators=(',', ':'), ensure_ascii=False)}\n\n"


def sse_start(message_metadata: dict | None = None) -> str:
    part: dict = {"type": "start"}
    if message_metadata is not None:
        part["messageMetadata"] = message_metadata
    return _frame(part)


def sse_text_start(text_id: str) -> str:
    return _frame({"type": "text-start", "id": text_id})


def sse_text_delta(text_id: str, delta: str) -> str:
    return _frame({"type": "text-delta", "id": text_id, "delta": delta})


def sse_text_end(text_id: str) -> str:
    return _frame({"type": "text-end", "id": text_id})


def sse_message_metadata(metadata: dict) -> str:
    return _frame({"type": "message-metadata", "messageMetadata": metadata})


def sse_data_status(label: str, stage: str) -> str:
    """A transient `data-status` part: surfaced to the client's onData callback
    (drives the live "what the model is doing" indicator) but NOT persisted into
    the assistant message's parts."""
    return _frame(
        {
            "type": "data-status",
            "data": {"label": label, "stage": stage},
            "transient": True,
        }
    )


def sse_data_report(report: dict | None, status: str) -> str:
    """A non-transient `data-report` part carrying the final BriefingReport (or
    null on failure) plus the run status. Consumed by the admin client's SSE
    reader (Spec C §9). Distinct from chat's text parts — this is a structured
    payload, not a token stream."""
    return _frame({"type": "data-report", "data": {"report": report, "status": status}})


def sse_finish(message_metadata: dict | None = None) -> str:
    part: dict = {"type": "finish"}
    if message_metadata is not None:
        part["messageMetadata"] = message_metadata
    return _frame(part)


def sse_done() -> str:
    return "data: [DONE]\n\n"
