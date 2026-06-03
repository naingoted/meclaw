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

        def embed(self, query):
            return []

    monkeypatch.setattr(runner, "get_chat_model", fake_get_chat_model)
    monkeypatch.setattr(runner, "Retriever", FakeRetriever)
    runner.build_production_runner.cache_clear()

    runner.build_production_runner()

    assert {"model": runner.TRIAGE_MODEL, "streaming": False, "thinking": False} in calls
    assert {"model": runner.DRAFT_MODEL, "streaming": True, "thinking": False} in calls


def test_build_runner_passes_floor_and_clustering(monkeypatch):
    import app.runner as runner_mod
    from app.runtime_config import RuntimeConfig

    captured = {}

    def fake_run_stream(messages, **kwargs):
        captured.update(kwargs)
        yield "ok"

    monkeypatch.setattr(runner_mod, "run_stream", fake_run_stream)
    # Avoid constructing real LLM clients.
    monkeypatch.setattr(runner_mod, "get_chat_model", lambda *a, **k: object())

    cfg = RuntimeConfig(
        triage_model="t", draft_model="d", top_k=4, score_floor=0.42, cluster_radius=0.17
    )
    run = runner_mod.build_runner(cfg)
    list(run([{"role": "user", "content": "hi"}]))

    assert captured["score_floor"] == 0.42
    assert callable(captured["embed_fn"])
    assert callable(captured["assign_cluster_fn"])
