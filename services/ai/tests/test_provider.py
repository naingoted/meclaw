import app.provider as provider


def test_get_chat_model_reads_env(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://gw.example/apps/anthropic/v1")
    monkeypatch.setenv("ANTHROPIC_MODEL", "qwen3.6-plus")
    provider.get_chat_model.cache_clear()

    provider.get_chat_model()

    assert captured["model"] == "qwen3.6-plus"
    # A trailing /v1 is stripped: langchain-anthropic appends /v1/messages itself,
    # so the same gateway URL the TS provider uses (with /v1) must not double up.
    assert captured["base_url"] == "https://gw.example/apps/anthropic"
    assert captured["api_key"] == "test-key"


def test_base_url_without_v1_is_unchanged(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://gw.example/apps/anthropic")
    provider.get_chat_model.cache_clear()

    provider.get_chat_model()

    assert captured["base_url"] == "https://gw.example/apps/anthropic"


def test_get_chat_model_defaults_model(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.delenv("ANTHROPIC_MODEL", raising=False)
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    provider.get_chat_model.cache_clear()

    provider.get_chat_model()

    assert captured["model"] == "qwen3.6-plus"
