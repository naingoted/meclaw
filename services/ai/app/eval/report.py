"""Aggregate scored cases into JSON (machine) + markdown (human) reports and an
opt-in regression verdict (spec §7.3). Pure functions + file writers; no I/O on
import."""

from __future__ import annotations

import json
from pathlib import Path
from statistics import mean


def aggregate(rows: list[dict]) -> dict:
    """Compute overall + per-category pass rates and mean of each numeric metric."""
    total = len(rows)
    passed = sum(1 for r in rows if r["scores"].get("passed"))

    by_category: dict[str, dict] = {}
    for r in rows:
        cat = by_category.setdefault(r["category"], {"total": 0, "passed": 0})
        cat["total"] += 1
        if r["scores"].get("passed"):
            cat["passed"] += 1
    for cat in by_category.values():
        cat["pass_rate"] = cat["passed"] / cat["total"] if cat["total"] else 0.0

    metric_values: dict[str, list[float]] = {}
    for r in rows:
        for k, v in r["scores"].items():
            if k == "passed":
                continue
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                metric_values.setdefault(k, []).append(float(v))
    metrics = {k: mean(vs) for k, vs in metric_values.items() if vs}

    return {
        "total": total,
        "passed": passed,
        "pass_rate": passed / total if total else 0.0,
        "by_category": by_category,
        "metrics": metrics,
    }


def below_thresholds(agg: dict, thresholds: dict[str, float]) -> bool:
    """True iff any configured aggregate falls below its threshold. `pass_rate`
    checks the overall rate; any other key checks `metrics[key]`."""
    for key, floor in thresholds.items():
        if key == "pass_rate":
            value = agg.get("pass_rate", 0.0)
        else:
            value = agg.get("metrics", {}).get(key, 0.0)
        if value < floor:
            return True
    return False


def _render_markdown(rows: list[dict], agg: dict) -> str:
    lines = ["# RAG Eval Report", ""]
    lines.append(f"**Overall:** {agg['passed']}/{agg['total']} passed "
                 f"({agg['pass_rate']:.0%})")
    lines.append("")
    lines.append("## By category")
    lines.append("")
    lines.append("| category | passed | total | pass rate |")
    lines.append("| --- | --- | --- | --- |")
    for cat, c in sorted(agg["by_category"].items()):
        lines.append(f"| {cat} | {c['passed']} | {c['total']} | {c['pass_rate']:.0%} |")
    lines.append("")
    if agg["metrics"]:
        lines.append("## Mean metrics")
        lines.append("")
        lines.append("| metric | mean |")
        lines.append("| --- | --- |")
        for k, v in sorted(agg["metrics"].items()):
            lines.append(f"| {k} | {v:.3f} |")
        lines.append("")
    lines.append("## Cases")
    lines.append("")
    lines.append("| id | category | passed |")
    lines.append("| --- | --- | --- |")
    for r in rows:
        mark = "✅" if r["scores"].get("passed") else "❌"
        lines.append(f"| {r['id']} | {r['category']} | {mark} |")
    return "\n".join(lines) + "\n"


def write_report(rows: list[dict], out_dir: str | Path) -> dict:
    """Write report.json + report.md to out_dir; return the aggregate."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    agg = aggregate(rows)
    (out / "report.json").write_text(json.dumps({"aggregate": agg, "cases": rows}, indent=2))
    (out / "report.md").write_text(_render_markdown(rows, agg))
    return agg
