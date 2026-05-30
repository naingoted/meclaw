---
title: "Project Case Study (sample)"
doc_type: "case_study"
created_for: "demo corpus"
tags: ["project", "case-study", "sample", "STAR"]
---

# Case Study: Real-Time Search Revamp

> **Sample knowledge doc.** Case studies in STAR form (Situation, Task, Action,
> Result) give the bot concrete, retrievable stories to answer behavioral and
> "tell me about a project" questions. Mirror this shape for your own work.

## Situation

Search on the main product was slow and returned stale results. Users abandoned
queries that took longer than two seconds, and the index lagged writes by minutes.

## Task

Cut query latency below 500ms and bring index freshness under five seconds,
without a full rewrite or new infrastructure budget.

## Action

- Profiled the hot path and found redundant N+1 lookups in the ranking step.
- Introduced an in-memory cache for the top query terms with a short TTL.
- Moved indexing to an incremental, event-driven pipeline.
- Added load tests to the CI gate so regressions fail the build.

## Result

- p95 query latency dropped from 2.1s to 380ms.
- Index freshness went from minutes to ~3s.
- Search abandonment fell measurably the following quarter.

## What I'd do differently

Instrument first. Half the early guesses about the bottleneck were wrong; the
profiler settled the debate in an afternoon.
