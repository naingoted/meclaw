import pytest
from pydantic import ValidationError

from app.research.schemas import BriefingReport, MatchedStrength, SourceRef


def test_briefing_report_minimal_valid():
    report = BriefingReport(summary="Strong fit for the backend role.")
    assert report.summary.startswith("Strong")
    assert report.matched_strengths == []
    assert report.sources == []
    assert report.fit_score is None


def test_matched_strength_requires_evidence_and_sources():
    s = MatchedStrength(
        point="Owns the AI sidecar",
        evidence="Built the LangGraph chat pipeline.",
        sources=[SourceRef(kind="corpus", ref="about.md", title="About")],
    )
    assert s.sources[0].kind == "corpus"


def test_source_ref_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        SourceRef(kind="telepathy", ref="x")
