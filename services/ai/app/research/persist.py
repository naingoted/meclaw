"""Persistence for research runs (Spec C §8). psycopg disjoint-writer — mirrors
app/gaps.py: the connect() factory is injected so unit tests run without a live
DB. JSONB columns are passed as json.dumps(...) with a ::jsonb cast."""

from __future__ import annotations

import json
import logging
from typing import Callable

import psycopg

from app import config

logger = logging.getLogger(__name__)

ConnectFn = Callable[[], "psycopg.Connection"]


def _default_connect() -> "psycopg.Connection":
    return psycopg.connect(config.DATABASE_URL)


def _j(value) -> str:
    return json.dumps(value)


class RunWriter:
    def __init__(self, connect: ConnectFn | None = None):
        self._connect = connect or _default_connect

    def start_run(self, request: dict, model_set: dict, use_case: str = "briefing") -> str:
        with self._connect() as conn:
            row = conn.execute(
                "INSERT INTO agent_runs "
                '(id, "useCase", input, status, "modelSet", "startedAt") '
                "VALUES (gen_random_uuid(), %s, %s::jsonb, 'running', %s::jsonb, now()) "
                "RETURNING id::text",
                (use_case, _j(request), _j(model_set)),
            ).fetchone()
            conn.commit()
        return row[0]

    def add_step(
        self,
        run_id: str,
        *,
        seq: int,
        role: str,
        input: dict | None = None,
        output: dict | None = None,
        tool_calls: list | None = None,
        verdict: str | None = None,
        score: float | None = None,
        retry_index: int | None = None,
        duration_ms: int | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO agent_steps "
                '(id, "runId", seq, role, input, output, "toolCalls", '
                '"validationVerdict", score, "retryIndex", "durationMs", "createdAt") '
                "VALUES (gen_random_uuid(), %s::uuid, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, "
                "%s, %s, %s, %s, now())",
                (
                    run_id,
                    seq,
                    role,
                    _j(input or {}),
                    _j(output or {}),
                    _j(tool_calls or []),
                    verdict,
                    score,
                    retry_index,
                    duration_ms,
                ),
            )
            conn.commit()

    def finish_run(
        self,
        run_id: str,
        *,
        status: str,
        report: dict | None,
        eval_records: list | None,
        totals: dict,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE agent_runs SET status = %s, report = %s::jsonb, "
                '"evalRecords" = %s::jsonb, subtasks = %s, retries = %s, '
                '"toolCalls" = %s, tokens = %s, "endedAt" = now() '
                "WHERE id = %s::uuid",
                (
                    status,
                    _j(report) if report is not None else None,
                    _j(eval_records or []),
                    totals.get("subtasks", 0),
                    totals.get("retries", 0),
                    totals.get("toolCalls", 0),
                    totals.get("tokens", 0),
                    run_id,
                ),
            )
            conn.commit()

    def fail_run(self, run_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                'UPDATE agent_runs SET status = \'error\', error = %s, "endedAt" = now() '
                "WHERE id = %s::uuid",
                (error[:2000], run_id),
            )
            conn.commit()
