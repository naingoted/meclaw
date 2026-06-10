"""Dataset generation drafts candidate cases; LLM injected so no gateway call."""

import yaml

from app.eval.dataset import load_dataset
from app.eval.generate import build_draft


def test_build_draft_emits_valid_cases_per_category(tmp_path):
    # Stub LLM returns a fixed JSON array of case dicts regardless of prompt.
    def fake_llm(prompt: str) -> str:
        return (
            '[{"id":"gen-1","category":"technical","question":"stack?",'
            '"expected_behavior":"answer"},'
            '{"id":"gen-2","category":"logistics","question":"salary?",'
            '"expected_behavior":"defer"}]'
        )

    cases = build_draft(corpus_text="Thet uses TypeScript.", llm=fake_llm)
    assert len(cases) == 2
    assert {c.category for c in cases} == {"technical", "logistics"}

    # round-trips through the loader (proves generated YAML is valid)
    out = tmp_path / "draft.yaml"
    out.write_text(
        yaml.safe_dump(
            [c.model_dump(exclude_none=True) for c in cases], sort_keys=False
        )
    )
    assert len(load_dataset(out)) == 2


def test_build_draft_skips_malformed_llm_items():
    def fake_llm(prompt: str) -> str:
        # one valid, one invalid (bad category) — invalid is dropped, not fatal
        return (
            '[{"id":"ok","category":"technical","question":"q","expected_behavior":"answer"},'
            '{"id":"bad","category":"nope","question":"q","expected_behavior":"answer"}]'
        )

    cases = build_draft(corpus_text="x", llm=fake_llm)
    assert [c.id for c in cases] == ["ok"]
