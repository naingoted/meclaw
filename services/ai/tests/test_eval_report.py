"""Report aggregation: per-case rows -> JSON + markdown + threshold verdict."""

import json

from app.eval.report import aggregate, below_thresholds, write_report


def _row(case_id, category, passed, **scores):
    return {"id": case_id, "category": category, "scores": {"passed": passed, **scores}}


def test_aggregate_computes_overall_and_per_category_pass_rates():
    rows = [
        _row("a", "technical", True, faithfulness=0.9),
        _row("b", "technical", False, faithfulness=0.2),
        _row("c", "logistics", True),
    ]
    agg = aggregate(rows)
    assert agg["total"] == 3
    assert agg["passed"] == 2
    assert agg["pass_rate"] == 2 / 3
    assert agg["by_category"]["technical"]["pass_rate"] == 0.5
    assert agg["by_category"]["logistics"]["pass_rate"] == 1.0
    # mean of present numeric metric across rows that have it
    assert round(agg["metrics"]["faithfulness"], 3) == round((0.9 + 0.2) / 2, 3)


def test_below_thresholds_detects_failing_aggregate():
    agg = {"pass_rate": 0.6, "metrics": {"faithfulness": 0.4}}
    assert below_thresholds(agg, {"pass_rate": 0.8}) is True
    assert below_thresholds(agg, {"faithfulness": 0.5}) is True
    assert below_thresholds(agg, {"pass_rate": 0.5}) is False
    assert below_thresholds(agg, {}) is False


def test_write_report_emits_json_and_markdown(tmp_path):
    rows = [_row("a", "technical", True, faithfulness=0.9)]
    write_report(rows, tmp_path)

    data = json.loads((tmp_path / "report.json").read_text())
    assert data["aggregate"]["total"] == 1
    assert data["cases"][0]["id"] == "a"

    md = (tmp_path / "report.md").read_text()
    assert "# RAG Eval Report" in md
    assert "technical" in md
    assert "| a |" in md  # per-case row present
