"""Web tools for the researcher (Spec C §6). Two tools, returned as Tool objects:
- tavily_search: LLM-oriented search (omitted when TAVILY_API_KEY is absent).
- fetch_url: GET a public URL with SSRF/timeout/size/content-type guards.

SSRF guard: resolve the host and reject any private/loopback/link-local/reserved/
metadata address BEFORE connecting, and re-validate each redirect hop. (DNS-
rebinding between check and connect is a residual risk at this layer; acceptable
for an operator-triggered tool — noted, not closed here.)"""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx

from app import config
from app.research.tool_caller import Tool

logger = logging.getLogger(__name__)

_ALLOWED_CONTENT = ("text/html", "text/plain")
_METADATA_IPS = {"169.254.169.254"}


class UnsafeUrlError(Exception):
    pass


def _resolve(host: str) -> list[str]:
    """All A/AAAA addresses for host (seam for tests to monkeypatch)."""
    infos = socket.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


def _is_public(addr: str) -> bool:
    if addr in _METADATA_IPS:
        return False
    ip = ipaddress.ip_address(addr)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeUrlError(f"unsupported url: {url!r}")
    for addr in _resolve(parsed.hostname):
        if not _is_public(addr):
            raise UnsafeUrlError(f"non-public address {addr} for host {parsed.hostname}")


def fetch_url(args: dict) -> dict:
    url = str(args.get("url", ""))
    try:
        assert_public_url(url)
    except UnsafeUrlError as exc:
        return {"error": f"blocked url: {exc}"}

    try:
        with httpx.Client(
            timeout=config.FETCH_TIMEOUT_S, follow_redirects=False
        ) as client:
            with client.stream("GET", url) as resp:
                # Redirects: re-validate each hop's target before following.
                hops = 0
                while resp.status_code in (301, 302, 303, 307, 308):
                    if hops >= config.FETCH_MAX_REDIRECTS:
                        return {"error": "too many redirects"}
                    nxt = resp.headers.get("location", "")
                    assert_public_url(nxt)
                    hops += 1
                    resp = client.stream("GET", nxt).__enter__()  # noqa: PLC2801
                ctype = resp.headers.get("content-type", "").split(";")[0].strip()
                if ctype and ctype not in _ALLOWED_CONTENT:
                    return {"error": f"unsupported content-type: {ctype}"}
                body = bytearray()
                for chunk in resp.iter_bytes(chunk_size=16384):
                    body.extend(chunk)
                    if len(body) > config.FETCH_MAX_BYTES:
                        body = body[: config.FETCH_MAX_BYTES]
                        break
        return {"url": url, "content": bytes(body).decode("utf-8", errors="replace")}
    except UnsafeUrlError as exc:
        return {"error": f"blocked redirect: {exc}"}
    except Exception as exc:  # timeout / transport / decode
        return {"error": f"fetch failed: {exc}"}


def _tavily_search(api_key: str):
    from tavily import TavilyClient

    client = TavilyClient(api_key=api_key)

    def _run(args: dict) -> dict:
        query = str(args.get("query", ""))
        try:
            res = client.search(query=query, max_results=int(args.get("max_results", 5)))
        except Exception as exc:  # network/quota → observation, not crash
            return {"error": f"search failed: {exc}"}
        return {
            "results": [
                {"url": r.get("url"), "title": r.get("title"), "content": r.get("content")}
                for r in res.get("results", [])
            ]
        }

    return _run


def build_web_tools(tavily_api_key: str | None = None) -> list[Tool]:
    key = tavily_api_key if tavily_api_key is not None else config.TAVILY_API_KEY
    tools = [
        Tool(
            name="fetch_url",
            description="Fetch a public web page (text/html or text/plain) by URL.",
            args_schema={"url": "str"},
            run=fetch_url,
        )
    ]
    if key:
        tools.insert(
            0,
            Tool(
                name="tavily_search",
                description="Search the web for a company/role. Returns titled snippets with URLs.",
                args_schema={"query": "str", "max_results": "int"},
                run=_tavily_search(key),
            ),
        )
    return tools
