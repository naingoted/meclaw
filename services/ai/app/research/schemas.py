"""Typed contracts for the research pipeline. The BriefingReport pydantic model
mirrors the Zod shape persisted as agent_runs.report jsonb (Spec C §7). The graph
state is a plain TypedDict (LangGraph), mirroring app/graph/state.py."""

from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, Field

SourceKind = Literal["corpus", "db", "web"]


class SourceRef(BaseModel):
    kind: SourceKind
    ref: str
    title: str | None = None


class MatchedStrength(BaseModel):
    point: str
    evidence: str
    sources: list[SourceRef] = Field(default_factory=list)


class GapPoint(BaseModel):
    point: str
    note: str


class BriefingReport(BaseModel):
    summary: str
    fit_score: float | None = None  # 0..1 optional self-assessed match
    matched_strengths: list[MatchedStrength] = Field(default_factory=list)
    gaps: list[GapPoint] = Field(default_factory=list)
    talking_points: list[str] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)


# --- LangGraph state (TypedDict; mirrors app/graph/state.py style) -----------


class Subtask(TypedDict, total=False):
    id: str
    query: str
    source: Literal["owner_corpus", "owner_db", "web"]
    status: Literal["pending", "resolved", "unresolved"]
    retry_count: int
    note: dict  # researcher output: {text, sources, tool_calls}
    verdict: Literal["good", "bad"] | None
    score: float | None


class ResearchState(TypedDict, total=False):
    request: dict  # {company?, role?, jd?}
    subtasks: list[Subtask]
    cursor: int  # index of the subtask under research
    notes: list[dict]  # validated notes, in resolution order
    iterations: int  # research-node entries (loop guard)
    tool_calls: int  # cumulative tool invocations
    retries: int  # cumulative re-plans
    report: dict | None  # BriefingReport.model_dump()
    status: Literal["running", "done", "degraded", "error"]
    route: str | None  # transient routing hint set by nodes
