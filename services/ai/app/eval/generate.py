"""Draft interview-style eval cases from the corpus (spec §6.2).

`uv run -m app.eval.generate --out eval/interview.draft.yaml`

The owner prunes/edits the draft into the committed eval/interview.yaml. The LLM
is injected (`llm`) so unit tests run without a gateway. Malformed candidate
items are skipped, never fatal — a partial draft is still useful to curate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable

import yaml

from app.corpus import corpus_fulltext
from app.eval.dataset import EvalCase
from app.provider import get_chat_model

LlmFn = Callable[[str], str]

_PROMPT = """\
You are drafting an evaluation set of realistic full-stack-engineer-interview
questions a recruiter or hiring manager would ask about the candidate.

Use the candidate corpus below to decide which facts are present. For each case
emit a JSON object with: id (kebab-case), category (one of technical,
culture_fit, stakeholder_mgmt, project_deep_dive, logistics), question,
expected_behavior (answer | defer | clarify). Mark a case "answer" only if the
fact is clearly in the corpus; "defer" for plausible recruiter questions whose
answer is NOT in the corpus (comp, visa, niche tech); "clarify" for ambiguous
questions. Spread cases across all five categories.

Return ONLY a JSON array of such objects, no prose.

CORPUS:
{corpus}
"""


def _default_llm(prompt: str) -> str:
    model = get_chat_model(streaming=False, thinking=False)
    return str(model.invoke(prompt).content)


def build_draft(corpus_text: str, llm: LlmFn) -> list[EvalCase]:
    raw = llm(_PROMPT.format(corpus=corpus_text))
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []
    cases: list[EvalCase] = []
    for item in items if isinstance(items, list) else []:
        try:
            cases.append(EvalCase(**item))
        except Exception:
            continue  # skip malformed candidate; partial draft still useful
    return cases


def main() -> None:
    parser = argparse.ArgumentParser(description="Draft eval cases from the corpus.")
    parser.add_argument("--out", default="eval/interview.draft.yaml")
    args = parser.parse_args()

    corpus_text, _ = corpus_fulltext()
    cases = build_draft(corpus_text, _default_llm)
    payload = [c.model_dump(exclude_none=True) for c in cases]
    Path(args.out).write_text(yaml.safe_dump(payload, sort_keys=False))
    print(f"wrote {len(cases)} draft cases to {args.out}")


if __name__ == "__main__":
    main()
