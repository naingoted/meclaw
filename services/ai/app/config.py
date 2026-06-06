"""Env-sourced settings. Shared retrieval constants MUST match the TS ingest
contract (lib/rag/*). See spec §10 — drift here silently breaks retrieval."""

import os

# Chat model (provider seam reads these; mirrors lib/ai/provider.ts)
ANTHROPIC_MODEL_DEFAULT = "qwen3.6-plus"
TRIAGE_MODEL = os.getenv("TRIAGE_MODEL", "glm-4.7")
DRAFT_MODEL = os.getenv("DRAFT_MODEL", "qwen3.6-plus")

# Retrieval contract — keep identical to lib/rag ingest config.
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://meclaw:meclaw@localhost:5432/meclaw"
)
VECTOR_SIZE = 768  # nomic-embed-text dimension
DISTANCE = "Cosine"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))

# Triage confidence threshold below which we ask a clarifying question.
TRIAGE_CONFIDENCE_THRESHOLD = float(os.getenv("TRIAGE_CONFIDENCE_THRESHOLD", "0.5"))

# RAG gap feedback loop. RAG_SCORE_FLOOR: a retrieval is grounded iff its top
# cosine score >= this; below floor → miss (reason='floor'). CLUSTER_RADIUS:
# max cosine distance for a miss to fold into an existing gap cluster.
# Conservative defaults — calibrate against real nomic-embed-text scores once live.
RAG_SCORE_FLOOR = float(os.getenv("RAG_SCORE_FLOOR", "0.35"))
CLUSTER_RADIUS = float(os.getenv("CLUSTER_RADIUS", "0.15"))

# `answer_used` hot-path heuristic: a draft "used" retrieval iff the share of its
# distinct word tokens also present in the kept-chunk context >= this ratio.
# Deliberately approximate (spec §5.2) — authoritative faithfulness is Ragas offline.
ANSWER_USE_THRESHOLD = float(os.getenv("ANSWER_USE_THRESHOLD", "0.3"))
