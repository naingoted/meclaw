"""Production wiring: bind the streaming runner to the real provider seam,
retriever, and tools. Imported lazily so tests can stub get_runner."""

from functools import lru_cache, partial

from app.config import DRAFT_MODEL, TRIAGE_MODEL
from app.graph.nodes import default_draft_stream_fn, default_triage_fn
from app.provider import get_chat_model
from app.retriever import Retriever
from app.streaming import run_stream
from app.tools import get_contact_info, schedule_call


@lru_cache(maxsize=1)
def build_production_runner():
    # Triage classifies in one shot (non-streaming); the draft streams tokens.
    triage_model = get_chat_model(TRIAGE_MODEL, streaming=False, thinking=False)
    draft_model = get_chat_model(DRAFT_MODEL, streaming=True, thinking=False)
    retriever = Retriever()
    return partial(
        run_stream,
        triage_fn=default_triage_fn(triage_model),
        retriever_retrieve=retriever.retrieve,
        draft_stream_fn=default_draft_stream_fn(draft_model),
        schedule_fn=schedule_call,
        contact_fn=get_contact_info,
    )
