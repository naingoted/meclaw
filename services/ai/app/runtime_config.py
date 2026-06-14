"""Runtime config resolution: request values override env defaults.

The Next.js /chat endpoint forwards a config snapshot (request values, edited
in /admin). This module merges request config with env defaults, with request
values winning over env values. Defaults must reproduce current behavior exactly.
"""

import os
from dataclasses import dataclass, field


KNOWN_AGENTS = ("triage", "knowledge", "scheduler", "contact")


@dataclass(frozen=True)
class RuntimeConfig:
    """Immutable runtime config resolved from request + env."""

    triage_model: str
    draft_model: str
    top_k: int
    persona: str = ""
    prompts: dict = field(default_factory=dict)
    score_floor: float = 0.35
    cluster_radius: float = 0.15
    score_threshold: float = 0.0
    gap_match_threshold: float = 0.15
    triage_confidence: float = 0.5
    cal_url: str = "https://cal.com/tet-nai"
    github_url: str = ""
    contact_email: str = "naingoted@gmail.com"


def resolve_config(payload: dict | None) -> RuntimeConfig:
    """Resolve runtime config from forwarded request payload + env defaults.

    Args:
        payload: Optional dict with structure:
            {
              "agents": {
                "<agent_name>": {"model": "...", "thinking": bool, "prompt": "..."},
                ...
              },
              "shared": {"persona": "..."},
              "rag": {"topK": <int>},
            }
            Unknown agent keys and reserved fields are ignored without error.

    Returns:
        RuntimeConfig with request values winning over env defaults.
    """
    if payload is None:
        payload = {}

    # Extract agents config (defaults to empty dict if missing)
    agents = payload.get("agents", {})

    # Resolve triage_model: request > env > default
    triage_model = os.getenv("TRIAGE_MODEL", "glm-4.7")
    if isinstance(agents, dict) and "triage" in agents:
        agent_cfg = agents.get("triage", {})
        if isinstance(agent_cfg, dict) and "model" in agent_cfg:
            req_model = agent_cfg["model"]
            if isinstance(req_model, str):
                triage_model = req_model

    # Resolve draft_model: request > env > default
    draft_model = os.getenv("DRAFT_MODEL", "qwen3.6-plus")
    if isinstance(agents, dict) and "knowledge" in agents:
        agent_cfg = agents.get("knowledge", {})
        if isinstance(agent_cfg, dict) and "model" in agent_cfg:
            req_model = agent_cfg["model"]
            if isinstance(req_model, str):
                draft_model = req_model

    # Resolve top_k: request > env > default
    top_k = int(os.getenv("RAG_TOP_K", "3"))
    rag = payload.get("rag", {})
    if isinstance(rag, dict) and "topK" in rag:
        req_top_k = rag["topK"]
        if isinstance(req_top_k, int):
            top_k = req_top_k

    # Resolve gap tunables: request > env > default.
    score_floor = float(os.getenv("RAG_SCORE_FLOOR", "0.35"))
    if isinstance(rag, dict) and isinstance(rag.get("scoreFloor"), (int, float)):
        score_floor = float(rag["scoreFloor"])

    cluster_radius = float(os.getenv("CLUSTER_RADIUS", "0.15"))
    if isinstance(rag, dict) and isinstance(rag.get("clusterRadius"), (int, float)):
        cluster_radius = float(rag["clusterRadius"])

    # Resolve persona: request > empty default
    persona = ""
    shared = payload.get("shared", {})
    if isinstance(shared, dict) and "persona" in shared:
        req_persona = shared["persona"]
        if isinstance(req_persona, str):
            persona = req_persona

    # Extract prompts: only known agents, only non-empty strings
    prompts = {}
    if isinstance(agents, dict):
        for agent_key in KNOWN_AGENTS:
            if agent_key in agents:
                agent_cfg = agents.get(agent_key, {})
                if isinstance(agent_cfg, dict) and "prompt" in agent_cfg:
                    prompt = agent_cfg["prompt"]
                    if isinstance(prompt, str) and prompt:
                        prompts[agent_key] = prompt

    # score_threshold: per-chunk include filter. Default 0.0 = include all.
    score_threshold = float(os.getenv("RAG_SCORE_THRESHOLD", "0.0"))
    if isinstance(rag, dict) and isinstance(rag.get("scoreThreshold"), (int, float)):
        score_threshold = float(rag["scoreThreshold"])

    # gap_match_threshold: max cosine distance for the resolved-gap fast path.
    gap_match_threshold = float(os.getenv("GAP_MATCH_THRESHOLD", "0.15"))
    if isinstance(rag, dict) and isinstance(rag.get("gapMatchThreshold"), (int, float)):
        gap_match_threshold = float(rag["gapMatchThreshold"])

    # triage_confidence: request (agents.triage.confidence) > env > 0.5.
    triage_confidence = float(os.getenv("TRIAGE_CONFIDENCE_THRESHOLD", "0.5"))
    if isinstance(agents, dict):
        triage_cfg = agents.get("triage", {})
        if isinstance(triage_cfg, dict) and isinstance(
            triage_cfg.get("confidence"), (int, float)
        ):
            triage_confidence = float(triage_cfg["confidence"])

    # public.* — only non-empty strings override the working defaults, so a blank
    # admin field can't break the cal/github/email tools.
    cal_url = os.getenv("NEXT_PUBLIC_CAL_URL", "https://cal.com/tet-nai")
    github_url = os.getenv("NEXT_PUBLIC_GITHUB_URL", "")
    contact_email = "naingoted@gmail.com"
    public = payload.get("public", {})
    if isinstance(public, dict):
        if isinstance(public.get("calUrl"), str) and public["calUrl"]:
            cal_url = public["calUrl"]
        if isinstance(public.get("githubUrl"), str) and public["githubUrl"]:
            github_url = public["githubUrl"]
        if isinstance(public.get("contactEmail"), str) and public["contactEmail"]:
            contact_email = public["contactEmail"]

    return RuntimeConfig(
        triage_model=triage_model,
        draft_model=draft_model,
        top_k=top_k,
        persona=persona,
        prompts=prompts,
        score_floor=score_floor,
        cluster_radius=cluster_radius,
        score_threshold=score_threshold,
        gap_match_threshold=gap_match_threshold,
        triage_confidence=triage_confidence,
        cal_url=cal_url,
        github_url=github_url,
        contact_email=contact_email,
    )
