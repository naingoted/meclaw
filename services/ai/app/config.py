"""Env-sourced settings. Shared retrieval constants MUST match the TS ingest
contract (lib/rag/*). See spec §10 — drift here silently breaks retrieval."""

import os

# Chat model (provider seam reads these; mirrors lib/ai/provider.ts)
ANTHROPIC_MODEL_DEFAULT = "qwen3.6-plus"

# Retrieval contract — keep identical to lib/rag ingest config.
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "echo_clone_knowledge")
VECTOR_SIZE = 768  # nomic-embed-text dimension
DISTANCE = "Cosine"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))

# Triage confidence threshold below which we ask a clarifying question.
TRIAGE_CONFIDENCE_THRESHOLD = float(os.getenv("TRIAGE_CONFIDENCE_THRESHOLD", "0.5"))
