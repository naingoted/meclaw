from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app import stream as sse
from app.runner import build_production_graph

app = FastAPI(title="echo-ai", version="0.1.0")

_TEXT_ID = "0"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def get_graph():
    """Indirection point so tests can monkeypatch with a stub graph."""
    return build_production_graph()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _final_text(final: dict) -> str:
    if final.get("needs_clarification"):
        return final.get("clarifying_question") or ""
    return final.get("draft") or ""


def _stream_final(final: dict):
    metadata = {
        "sources": final.get("sources", []),
        "route": final.get("route"),
        "intent": final.get("intent"),
    }
    yield sse.sse_start(metadata)
    yield sse.sse_text_start(_TEXT_ID)
    yield sse.sse_text_delta(_TEXT_ID, _final_text(final))
    yield sse.sse_text_end(_TEXT_ID)
    yield sse.sse_finish(metadata)
    yield sse.sse_done()


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.messages:
        return JSONResponse({"error": "messages must not be empty"}, status_code=400)

    state = {"messages": [m.model_dump() for m in request.messages]}
    final = get_graph().invoke(state)

    return StreamingResponse(
        _stream_final(final),
        media_type="text/event-stream",
        headers=sse.SSE_HEADERS,
    )
