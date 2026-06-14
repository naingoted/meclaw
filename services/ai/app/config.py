"""Env-sourced settings. Shared retrieval constants MUST match the TS ingest
contract (lib/rag/*). See spec §10 — drift here silently breaks retrieval."""

import os

# Chat model (provider seam reads these; mirrors lib/ai/provider.ts)
ANTHROPIC_MODEL_DEFAULT = "qwen3.6-plus"
TRIAGE_MODEL = os.getenv("TRIAGE_MODEL", "glm-4.7")
DRAFT_MODEL = os.getenv("DRAFT_MODEL", "qwen3.6-plus")

# Stack identity: the human the bot represents. Set per customer at provision.
# Admin-editable prompts (settings.agents.*.prompt) override the persona
# fallbacks; this env only feeds module-level templates and fallbacks.
OWNER_NAME = os.getenv("BOT_OWNER_NAME", "Thet")
CONTACT_EMAIL = os.getenv("BOT_CONTACT_EMAIL", "naingoted@gmail.com")

# Retrieval contract — keep identical to lib/rag ingest config.
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://meclaw:meclaw@localhost:5432/meclaw"
)
VECTOR_SIZE = 768  # nomic-embed-text dimension
DISTANCE = "Cosine"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "3"))

# Triage confidence threshold below which we ask a clarifying question.
TRIAGE_CONFIDENCE_THRESHOLD = float(os.getenv("TRIAGE_CONFIDENCE_THRESHOLD", "0.5"))

# History cap (caching spec lever 1): bound the per-request prompt sent to the
# LLM. Window of most-recent messages plus an estimated-token budget — drop
# oldest when over. The full history still feeds lead-marker scanning.
HISTORY_MAX_MESSAGES = int(os.getenv("HISTORY_MAX_MESSAGES", "10"))
HISTORY_TOKEN_BUDGET = int(os.getenv("HISTORY_TOKEN_BUDGET", "2000"))

# Token-aware assembly (caching spec lever 6): hard ceiling on the assembled
# prompt. Budget = window - system - query; drop oldest chunks then oldest
# history to fit. Generous default — L1/L2 already bound size, so this is a
# defensive cap against overflow. chars/4 estimate (see app.history).
MODEL_CONTEXT_WINDOW = int(os.getenv("MODEL_CONTEXT_WINDOW", "8192"))

# RAG gap feedback loop. RAG_SCORE_FLOOR: a retrieval is grounded iff its top
# cosine score >= this; below floor → miss (reason='floor'). CLUSTER_RADIUS:
# max cosine distance for a miss to fold into an existing gap cluster.
# Conservative defaults — calibrate against real nomic-embed-text scores once live.
RAG_SCORE_FLOOR = float(os.getenv("RAG_SCORE_FLOOR", "0.35"))
CLUSTER_RADIUS = float(os.getenv("CLUSTER_RADIUS", "0.15"))

# Resolved-gap fast path: a query whose embedding lands within this cosine
# DISTANCE of a resolved cluster centroid gets the curated answer verbatim.
# Same scale as CLUSTER_RADIUS.
GAP_MATCH_THRESHOLD = float(os.getenv("GAP_MATCH_THRESHOLD", "0.15"))

# `answer_used` hot-path heuristic: a draft "used" retrieval iff the share of its
# distinct word tokens also present in the kept-chunk context >= this ratio.
# Deliberately approximate (spec §5.2) — authoritative faithfulness is Ragas offline.
ANSWER_USE_THRESHOLD = float(os.getenv("ANSWER_USE_THRESHOLD", "0.3"))

# --- Spec C: research/briefing agent (additive; never on the chat path) ------

# Models (provider-agnostic; routed through get_chat_model). Default the
# reasoning roles to the triage model and synthesis to the draft model so a
# single gateway/model swap (provider.py) covers everything.
RESEARCH_MODEL = os.getenv("RESEARCH_MODEL", TRIAGE_MODEL)  # planner/researcher/judge
RESEARCH_SYNTH_MODEL = os.getenv("RESEARCH_SYNTH_MODEL", DRAFT_MODEL)

# Tool-calling mode for the researcher loop — set from the §7.1 spike outcome.
# "json" (default) works regardless of gateway native tool-calling support.
RESEARCH_TOOLCALL_MODE = os.getenv("RESEARCH_TOOLCALL_MODE", "json")  # json | native

# Budgets / loop guards (Spec C §5, §10). Degrade-not-hang on exhaustion.
RESEARCH_MAX_SUBTASKS = int(os.getenv("RESEARCH_MAX_SUBTASKS", "6"))
RESEARCH_RETRY_BUDGET = int(os.getenv("RESEARCH_RETRY_BUDGET", "2"))  # per subtask
RESEARCH_MAX_ITERATIONS = int(
    os.getenv("RESEARCH_MAX_ITERATIONS", "24")
)  # global loop guard
RESEARCH_MAX_TOOL_CALLS = int(os.getenv("RESEARCH_MAX_TOOL_CALLS", "30"))
RESEARCH_REACT_MAX_STEPS = int(
    os.getenv("RESEARCH_REACT_MAX_STEPS", "4")
)  # tool turns / subtask

# Validation thresholds (Spec C §5).
RESEARCH_MIN_NOTE_CHARS = int(os.getenv("RESEARCH_MIN_NOTE_CHARS", "40"))
RESEARCH_JUDGE_THRESHOLD = float(os.getenv("RESEARCH_JUDGE_THRESHOLD", "0.6"))
RESEARCH_CORPUS_SCORE_FLOOR = float(
    os.getenv("RESEARCH_CORPUS_SCORE_FLOOR", str(RAG_SCORE_FLOOR))
)

# Operator-scope MCP client (Spec A server over Streamable HTTP + bearer).
MCP_OPERATOR_URL = os.getenv("MCP_OPERATOR_URL", "http://localhost:8787/mcp")
MCP_AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN")  # bearer for the HTTP transport

# Web tools. Absent TAVILY_API_KEY → web subtasks degrade (not fatal, Spec C §6).
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
FETCH_TIMEOUT_S = float(os.getenv("FETCH_TIMEOUT_S", "10"))
FETCH_MAX_BYTES = int(os.getenv("FETCH_MAX_BYTES", str(1_000_000)))  # ~1 MB
FETCH_MAX_REDIRECTS = int(os.getenv("FETCH_MAX_REDIRECTS", "3"))
