"""Eval runner CLI (spec §7.1).

    uv run -m app.eval.run --set eval/interview.yaml --report out/
    uv run -m app.eval.run --set eval/interview.yaml --report out/ --ci

Drives the REAL run_stream pipeline per case (production retriever, triage, gate,
draft model), scores with Ragas + custom checks, writes report.json/report.md.
`--ci` exits non-zero when an aggregate falls below a configured threshold
(opt-in regression gate; NOT wired into blocking PR CI in this spec)."""

from __future__ import annotations

import argparse
import sys
from functools import partial

from app import gaps
from app.config import (
    ANSWER_USE_THRESHOLD,
    CLUSTER_RADIUS,
    DRAFT_MODEL,
    RAG_SCORE_FLOOR,
    TRIAGE_MODEL,
)
from app.corpus import corpus_version
from app.eval.collect import collect_case
from app.eval.dataset import load_dataset
from app.eval.metrics import build_ragas_score_fn, score_case
from app.eval.report import below_thresholds, write_report
from app.graph.nodes import default_draft_stream_fn, default_triage_fn
from app.provider import get_chat_model
from app.retriever import Retriever
from app.streaming import run_stream

# Opt-in regression thresholds. Tune against the first real run before trusting.
_CI_THRESHOLDS = {"pass_rate": 0.7, "faithfulness": 0.5}


def _build_real_runner() -> tuple:
    """A production-shaped runner plus a chunk-id→text capture so collect can
    turn kept chunks into Ragas contexts. The retriever is wrapped to record the
    text of every chunk it returns this process."""
    triage_model = get_chat_model(TRIAGE_MODEL, streaming=False, thinking=False)
    draft_model = get_chat_model(DRAFT_MODEL, streaming=True, thinking=False)
    retriever = Retriever()
    chunk_text_by_id: dict[str, str] = {}

    def capturing_retrieve(query: str):
        result = retriever.retrieve(query)
        for c in result.chunks:
            chunk_text_by_id[c.id] = c.text
        return result

    runner = partial(
        run_stream,
        triage_fn=default_triage_fn(triage_model),
        retriever_retrieve=capturing_retrieve,
        draft_stream_fn=default_draft_stream_fn(draft_model),
        schedule_fn=lambda: {},
        contact_fn=lambda: {},
        corpus_version_fn=corpus_version,
        score_floor=RAG_SCORE_FLOOR,
        answer_use_threshold=ANSWER_USE_THRESHOLD,
        embed_fn=retriever.embed,
        assign_cluster_fn=lambda emb, q: gaps.assign_cluster(emb, q, radius=CLUSTER_RADIUS),
    )
    return runner, chunk_text_by_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the RAG eval set.")
    parser.add_argument("--set", dest="dataset", default="eval/interview.yaml")
    parser.add_argument("--report", dest="report_dir", default="out")
    parser.add_argument("--ci", action="store_true", help="exit non-zero below thresholds")
    args = parser.parse_args()

    cases = load_dataset(args.dataset)
    runner, chunk_text_by_id = _build_real_runner()
    ragas_score_fn = build_ragas_score_fn()

    rows = []
    for case in cases:
        result = collect_case(runner, case.question, chunk_text_by_id=chunk_text_by_id)
        scores = score_case(case, result, ragas_score_fn=ragas_score_fn)
        rows.append({"id": case.id, "category": case.category, "scores": scores})
        print(f"[{'PASS' if scores.get('passed') else 'FAIL'}] {case.id}")

    agg = write_report(rows, args.report_dir)
    print(
        f"\n{agg['passed']}/{agg['total']} passed ({agg['pass_rate']:.0%}) -> "
        f"{args.report_dir}/report.md"
    )

    if args.ci and below_thresholds(agg, _CI_THRESHOLDS):
        print("Regression: aggregate below configured thresholds.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
