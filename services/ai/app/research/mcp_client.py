"""Operator-scope MCP client (Spec A's deferred U2, minimal slice for Spec C).
Connects to the @meclaw/mcp Streamable-HTTP server with a bearer token, loads its
operator tools (search_corpus, run_read_query, describe_schema, get_telemetry),
and adapts each into the researcher's Tool seam.

The langchain-mcp-adapters client is loaded once at startup. Its get_tools() is
async in the library; we drive it to completion synchronously so the rest of the
pipeline stays sync (matching app/gaps.py / app/graph/nodes.py). Verify the
installed adapter's API shape — adjust the loader only; adapt_mcp_tools is stable."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app import config
from app.research.tool_caller import Tool

logger = logging.getLogger(__name__)


def adapt_mcp_tools(lc_tools: list[Any]) -> list[Tool]:
    """Wrap langchain MCP tools into our Tool seam (sync .invoke delegation)."""
    out: list[Tool] = []
    for lc in lc_tools:
        name = getattr(lc, "name")
        out.append(
            Tool(
                name=name,
                description=getattr(lc, "description", "") or name,
                args_schema={},  # MCP advertises its own JSON schema; the model is told via name+desc
                run=(lambda t: lambda args: t.invoke(args))(lc),
            )
        )
    return out


def load_operator_tools(url: str | None = None, token: str | None = None) -> list[Tool]:
    """Connect to @meclaw/mcp (operator scope, HTTP+bearer) and adapt its tools.
    Returns [] on connect failure (researcher degrades — owner subtasks unresolved,
    never a crash). Mirrors Spec C §6's 'absent → skipped, not fatal' posture."""
    target = url or config.MCP_OPERATOR_URL
    bearer = token or config.MCP_AUTH_TOKEN
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        client = MultiServerMCPClient(
            {
                "meclaw": {
                    "transport": "streamable_http",
                    "url": target,
                    "headers": {"Authorization": f"Bearer {bearer}"} if bearer else {},
                }
            }
        )
        lc_tools = asyncio.run(client.get_tools())
        return adapt_mcp_tools(lc_tools)
    except Exception as exc:
        logger.warning(
            "MCP operator tools unavailable (%s); owner subtasks will degrade", exc
        )
        return []
