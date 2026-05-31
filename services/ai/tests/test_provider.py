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


def test_thinking_kwargs_helper():
    assert provider._thinking_kwargs(True) == {}
    assert provider._thinking_kwargs(False) == {"thinking": {"type": "disabled"}}


def test_explicit_model_overrides_env(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "env-model")
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    provider.get_chat_model.cache_clear()

    provider.get_chat_model("explicit-model")

    assert captured["model"] == "explicit-model"


def test_explicit_empty_model_overrides_env(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_MODEL", "env-model")
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    provider.get_chat_model.cache_clear()

    provider.get_chat_model("")

    assert captured["model"] == ""


def test_thinking_off_injects_disable_kwargs(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    provider.get_chat_model.cache_clear()

    provider.get_chat_model("glm-4.7", thinking=False)

    assert captured == {
        "model": "glm-4.7",
        "api_key": "test-key",
        "streaming": False,
        "thinking": {"type": "disabled"},
    }


def test_thinking_on_omits_disable_kwargs(monkeypatch):
    captured = {}

    class FakeChatAnthropic:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(provider, "ChatAnthropic", FakeChatAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    provider.get_chat_model.cache_clear()

    provider.get_chat_model("qwen3.6-plus", thinking=True)

    assert captured == {
        "model": "qwen3.6-plus",
        "api_key": "test-key",
        "streaming": False,
    }
