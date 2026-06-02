from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app import stream as sse
from app.corpus import corpus_state

app = FastAPI(title="meclaw-ai", version="0.1.0")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    config: dict | None = None


def get_runner(config: dict | None = None):
    """Indirection point so tests can monkeypatch with a stub runner.

    Builds a per-request runner from the forwarded config (request values win,
    env defaults fall back). Returns (messages: list[dict]) -> Iterator[str].
    """
    from app.runtime_config import resolve_config
    from app.runner import build_runner
    return build_runner(resolve_config(config))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/corpus-status")
def corpus_status_route() -> dict:
    return corpus_state()


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.messages:
        return JSONResponse({"error": "messages must not be empty"}, status_code=400)

    messages = [m.model_dump() for m in request.messages]
    return StreamingResponse(
        get_runner(request.config)(messages),
        media_type="text/event-stream",
        headers=sse.SSE_HEADERS,
    )
