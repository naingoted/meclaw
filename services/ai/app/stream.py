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


def sse_finish(message_metadata: dict | None = None) -> str:
    part: dict = {"type": "finish"}
    if message_metadata is not None:
        part["messageMetadata"] = message_metadata
    return _frame(part)


def sse_done() -> str:
    return "data: [DONE]\n\n"
