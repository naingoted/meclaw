"""Offline RAG evaluation harness (spec B, Unit C). Drives the real run_stream
pipeline per ground-truth case and scores with Ragas + custom checks. Never runs
on the hot path; never writes the DB."""
