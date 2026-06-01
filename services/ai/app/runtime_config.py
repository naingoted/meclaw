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
    top_k = int(os.getenv("RAG_TOP_K", "4"))
    rag = payload.get("rag", {})
    if isinstance(rag, dict) and "topK" in rag:
        req_top_k = rag["topK"]
        if isinstance(req_top_k, int):
            top_k = req_top_k

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

    return RuntimeConfig(
        triage_model=triage_model,
        draft_model=draft_model,
        top_k=top_k,
        persona=persona,
        prompts=prompts,
    )
