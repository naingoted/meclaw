"""Production graph wiring: bind the abstract graph to the real provider seam,
retriever, and tools. Imported lazily so tests can stub get_graph."""

from functools import lru_cache

from app.graph.build import GraphDeps, build_graph
from app.graph.nodes import default_draft_fn, default_triage_fn
from app.provider import get_chat_model
from app.retriever import Retriever
from app.tools import get_contact_info, schedule_call


@lru_cache(maxsize=1)
def build_production_graph():
    chat_model = get_chat_model(streaming=False)
    retriever = Retriever()
    deps = GraphDeps(
        triage_fn=default_triage_fn(chat_model),
        retriever_retrieve=retriever.retrieve,
        draft_fn=default_draft_fn(chat_model),
        schedule_fn=schedule_call,
        contact_fn=get_contact_info,
    )
    return build_graph(deps)
