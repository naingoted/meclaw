from typing import TypedDict


class GraphState(TypedDict, total=False):
    messages: list[dict]          # full history: [{role, content}, ...]
    intent: str | None            # tech | project | scheduler | contact | general
    confidence: float | None
    route: str | None             # node chosen, or "respond" for clarification
    retrieved_chunks: list        # list[RetrievedChunk]
    sources: list                 # [{source, title, score}]
    draft: str | None
    needs_clarification: bool
    clarifying_question: str | None
