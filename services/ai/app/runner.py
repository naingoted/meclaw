"""Production wiring: bind the streaming runner to the real provider seam,
retriever, and tools. Imported lazily so tests can stub get_runner."""

from functools import lru_cache, partial

from app import gaps
from app.config import CLUSTER_RADIUS, DRAFT_MODEL, RAG_SCORE_FLOOR, TRIAGE_MODEL
from app.corpus import corpus_fulltext, corpus_version
from app.graph.nodes import default_draft_stream_fn, default_triage_fn
from app.provider import get_chat_model
from app.retriever import Retriever
from app.runtime_config import RuntimeConfig
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
        corpus_version_fn=corpus_version,
        score_floor=RAG_SCORE_FLOOR,
        embed_fn=retriever.embed,
        assign_cluster_fn=lambda emb, q: gaps.assign_cluster(emb, q, radius=CLUSTER_RADIUS),
    )


def build_runner(cfg: RuntimeConfig):
    """Build a per-request runner from resolved runtime config.

    Request values (forwarded from /admin) override env defaults. Each request
    gets fresh model instances bound to the resolved config. get_chat_model is
    lru_cache'd by model name, so per-request rebuilds are cheap.

    Args:
        cfg: RuntimeConfig with triage_model, draft_model, top_k, persona, prompts,
             score_floor, cluster_radius, score_threshold, tiny_corpus_threshold,
             triage_confidence, cal_url, github_url, contact_email.

    Returns:
        A partial(run_stream, ...) callable that accepts (messages: list[dict]).
    """
    triage_model = get_chat_model(cfg.triage_model, streaming=False, thinking=False)
    draft_model = get_chat_model(cfg.draft_model, streaming=True, thinking=False)
    retriever = Retriever(top_k=cfg.top_k)
    return partial(
        run_stream,
        triage_fn=default_triage_fn(triage_model, system=cfg.prompts.get("triage")),
        retriever_retrieve=retriever.retrieve,
        draft_stream_fn=default_draft_stream_fn(draft_model),
        schedule_fn=partial(schedule_call, url=cfg.cal_url),
        contact_fn=partial(get_contact_info, email=cfg.contact_email, github=cfg.github_url or None),
        corpus_version_fn=corpus_version,
        knowledge_system=cfg.prompts.get("knowledge"),
        scheduler_system=cfg.prompts.get("scheduler"),
        contact_system=cfg.prompts.get("contact"),
        persona_prefix=cfg.persona,
        score_floor=cfg.score_floor,
        score_threshold=cfg.score_threshold,
        tiny_corpus_threshold=cfg.tiny_corpus_threshold,
        triage_confidence=cfg.triage_confidence,
        corpus_text_fn=corpus_fulltext,
        embed_fn=retriever.embed,
        assign_cluster_fn=lambda emb, q: gaps.assign_cluster(emb, q, radius=cfg.cluster_radius),
    )
