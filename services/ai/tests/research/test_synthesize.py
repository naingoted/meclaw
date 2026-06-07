import pytest

from app.research.schemas import BriefingReport
from app.research.synthesize import make_synthesizer


def _model(content):
    class _Model:
        def invoke(self, messages):
            class _R:
                pass

            r = _R()
            r.content = content
            return r

    return _Model()


def test_synthesizes_valid_briefing_report():
    payload = (
        '{"summary": "Strong backend fit.",'
        '"fit_score": 0.8,'
        '"matched_strengths": [{"point": "Owns AI sidecar",'
        '"evidence": "Built LangGraph pipeline", "sources": '
        '[{"kind": "corpus", "ref": "about.md"}]}],'
        '"gaps": [{"point": "No k8s", "note": "not shown in corpus"}],'
        '"talking_points": ["Ask about scaling"],'
        '"sources": [{"kind": "web", "ref": "https://acme.com", "title": "Acme"}]}'
    )
    report = make_synthesizer(_model(payload))(
        {"company": "Acme", "role": "Backend"},
        [{"text": "Thet built the sidecar.", "sources": [{"source": "about.md", "score": 0.7}]}],
    )
    assert isinstance(report, BriefingReport)
    assert report.fit_score == 0.8
    assert report.matched_strengths[0].sources[0].kind == "corpus"


def test_unparseable_synthesis_returns_degraded_summary_not_crash():
    report = make_synthesizer(_model("the model rambled"))(
        {"company": "Acme"}, [{"text": "note", "sources": []}]
    )
    assert isinstance(report, BriefingReport)
    assert "couldn't" in report.summary.lower() or "could not" in report.summary.lower()
