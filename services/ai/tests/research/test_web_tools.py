import pytest

from app.research.web_tools import (
    UnsafeUrlError,
    assert_public_url,
    build_web_tools,
    fetch_url,
)


def test_rejects_loopback_and_private_and_metadata(monkeypatch):
    # Force name resolution to known-bad addresses.
    def fake_resolve(host):
        return {
            "evil.local": ["127.0.0.1"],
            "intranet": ["10.0.0.5"],
            "metadata": ["169.254.169.254"],
        }[host]

    monkeypatch.setattr("app.research.web_tools._resolve", fake_resolve)
    for host in ("evil.local", "intranet", "metadata"):
        with pytest.raises(UnsafeUrlError):
            assert_public_url(f"http://{host}/x")


def test_accepts_public_address(monkeypatch):
    monkeypatch.setattr("app.research.web_tools._resolve", lambda host: ["93.184.216.34"])
    assert_public_url("https://example.com/path") is None  # no raise


def test_fetch_enforces_content_type_allowlist(monkeypatch):
    monkeypatch.setattr("app.research.web_tools._resolve", lambda host: ["93.184.216.34"])

    class _Resp:
        status_code = 200
        headers = {"content-type": "application/pdf"}

        def iter_bytes(self, chunk_size=0):
            yield b"%PDF-1.4"

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class _Client:
        def __init__(self, *a, **k):
            pass

        def stream(self, *a, **k):
            return _Resp()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr("app.research.web_tools.httpx.Client", _Client)
    out = fetch_url({"url": "https://example.com/doc"})
    assert out["error"].startswith("unsupported content-type")


def test_build_web_tools_omits_search_without_api_key():
    tools = build_web_tools(tavily_api_key=None)
    names = {t.name for t in tools}
    assert "fetch_url" in names
    assert "tavily_search" not in names
