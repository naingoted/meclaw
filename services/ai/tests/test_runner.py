"""build_production_runner wires two distinct, thinking-off models."""

import app.runner as runner


def test_runner_splits_triage_and_draft_models(monkeypatch):
    calls = []

    def fake_get_chat_model(model=None, *, streaming=False, thinking=False):
        calls.append({"model": model, "streaming": streaming, "thinking": thinking})
        return object()

    class FakeRetriever:
        def retrieve(self, query):
            return None

    monkeypatch.setattr(runner, "get_chat_model", fake_get_chat_model)
    monkeypatch.setattr(runner, "Retriever", FakeRetriever)
    runner.build_production_runner.cache_clear()

    runner.build_production_runner()

    assert {"model": runner.TRIAGE_MODEL, "streaming": False, "thinking": False} in calls
    assert {"model": runner.DRAFT_MODEL, "streaming": True, "thinking": False} in calls
