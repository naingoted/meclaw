from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app import stream as sse
from app.runner import build_production_runner

app = FastAPI(title="meclaw-ai", version="0.1.0")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def get_runner():
    """Indirection point so tests can monkeypatch with a stub runner.

    Returns a callable: (messages: list[dict]) -> Iterator[str] of SSE frames.
    """
    return build_production_runner()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.messages:
        return JSONResponse({"error": "messages must not be empty"}, status_code=400)

    messages = [m.model_dump() for m in request.messages]
    return StreamingResponse(
        get_runner()(messages),
        media_type="text/event-stream",
        headers=sse.SSE_HEADERS,
    )
