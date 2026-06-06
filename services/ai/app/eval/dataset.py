"""Ground-truth eval dataset: pydantic model + YAML loader (spec §6.1).

Categories probe the real use-case — recruiter / hiring-manager questions about
the owner. `expected_behavior` encodes the failure mode each case guards:
  answer  — fact is in the corpus → expect a grounded, correct answer.
  defer   — fact is NOT in the corpus → expect a graceful deferral + lead offer,
            never a fabrication (probes hallucination).
  clarify — ambiguous → expect a clarifying question.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, ValidationError

Category = Literal[
    "technical", "culture_fit", "stakeholder_mgmt", "project_deep_dive", "logistics"
]
ExpectedBehavior = Literal["answer", "defer", "clarify"]


class EvalCase(BaseModel):
    model_config = {"extra": "forbid"}

    id: str
    category: Category
    question: str
    expected_behavior: ExpectedBehavior
    reference_answer: str | None = None
    must_include: list[str] = Field(default_factory=list)
    notes: str | None = None


def load_dataset(path: str | Path) -> list[EvalCase]:
    """Parse + validate the YAML eval set. Raises ValueError on malformed YAML,
    schema violations, or duplicate ids."""
    raw = yaml.safe_load(Path(path).read_text())
    if not isinstance(raw, list):
        raise ValueError("eval dataset must be a YAML list of cases")
    try:
        cases = [EvalCase(**item) for item in raw]
    except ValidationError as exc:
        raise ValueError(f"invalid eval case: {exc}") from exc
    seen: set[str] = set()
    for c in cases:
        if c.id in seen:
            raise ValueError(f"duplicate case id: {c.id}")
        seen.add(c.id)
    return cases
