# Gateway Tool-Calling Spike (Spec A §7.1)

**Status:** PENDING LIVE RUN — script written, not yet executed.

**Question:** Does `qwen3.6-plus` via the Anthropic-compatible gateway support native
tool-calling (`bind_tools`)? This gates U2/U3 (the Python MCP client + graph refactor).
U1 does not depend on the outcome.

## How to run

From `services/ai`, with gateway creds in env:

```bash
cd services/ai && uv run python scripts/spike_tool_calling.py
```

Prints `RESULT_A` (thinking OFF) and `RESULT_B` (thinking ON), each one of
`PASS` / `NO_TOOL_CALLS` / `ERROR <type>`.

## Finding

- Model: _pending (e.g. qwen3.6-plus)_
- Gateway base URL: _pending_
- RESULT_A (thinking OFF): _pending_
- RESULT_B (thinking ON): _pending_

## Verdict (fill after running)

- **PASS (either mode):** U2 binds tools natively via `bind_tools`; record which
  `thinking` setting works.
- **NO_TOOL_CALLS / ERROR (both):** U2/U3 must use the JSON-loop fallback (model emits
  tool-call JSON, dispatched manually) — same MCP server surface, different agent loop.

This document is the input to the U2/U3 plan.
