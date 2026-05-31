"""Model-name env overrides for the triage/draft split."""

import importlib

import app.config as config


def test_model_defaults(monkeypatch):
    monkeypatch.delenv("TRIAGE_MODEL", raising=False)
    monkeypatch.delenv("DRAFT_MODEL", raising=False)
    importlib.reload(config)
    assert config.TRIAGE_MODEL == "glm-4.7"
    assert config.DRAFT_MODEL == "qwen3.6-plus"


def test_model_env_overrides(monkeypatch):
    monkeypatch.setenv("TRIAGE_MODEL", "glm-4.7-test")
    monkeypatch.setenv("DRAFT_MODEL", "qwen-test")
    importlib.reload(config)
    try:
        assert config.TRIAGE_MODEL == "glm-4.7-test"
        assert config.DRAFT_MODEL == "qwen-test"
    finally:
        # Restore module-level defaults so later tests see clean config.
        monkeypatch.delenv("TRIAGE_MODEL", raising=False)
        monkeypatch.delenv("DRAFT_MODEL", raising=False)
        importlib.reload(config)
