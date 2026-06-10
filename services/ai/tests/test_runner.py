"""build_production_runner wires two distinct, thinking-off models."""

import app.runner as runner
from app.config import ANSWER_USE_THRESHOLD


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

    assert {
        "model": runner.TRIAGE_MODEL,
        "streaming": False,
        "thinking": False,
    } in calls
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
        triage_model="t",
        draft_model="d",
        top_k=4,
        score_floor=0.42,
        cluster_radius=0.17,
    )
    run = runner_mod.build_runner(cfg)
    list(run([{"role": "user", "content": "hi"}]))

    assert captured["score_floor"] == 0.42
    assert callable(captured["embed_fn"])
    assert callable(captured["assign_cluster_fn"])


def test_build_runner_threads_new_config_and_binds_tools(monkeypatch):
    import app.runner as runner_mod
    from app.runtime_config import RuntimeConfig

    captured = {}

    def fake_run_stream(messages, **kwargs):
        captured.update(kwargs)
        yield "ok"

    monkeypatch.setattr(runner_mod, "run_stream", fake_run_stream)
    monkeypatch.setattr(runner_mod, "get_chat_model", lambda *a, **k: object())

    cfg = RuntimeConfig(
        triage_model="t",
        draft_model="d",
        top_k=4,
        score_threshold=0.3,
        gap_match_threshold=0.22,
        triage_confidence=0.65,
        cal_url="https://cal.com/owner",
        github_url="https://github.com/owner",
        contact_email="owner@example.com",
    )
    run = runner_mod.build_runner(cfg)
    list(run([{"role": "user", "content": "hi"}]))

    assert captured["score_threshold"] == 0.3
    assert captured["gap_match_threshold"] == 0.22
    assert callable(captured["gap_match_fn"])
    assert "tiny_corpus_threshold" not in captured
    assert "corpus_text_fn" not in captured
    # tools are bound to the resolved public values
    assert captured["schedule_fn"]() == {"url": "https://cal.com/owner"}
    assert captured["contact_fn"]() == {
        "email": "owner@example.com",
        "github": "https://github.com/owner",
    }


def test_production_runner_binds_answer_use_threshold(monkeypatch):
    captured = {}

    def fake_run_stream(messages, **kwargs):
        captured.update(kwargs)
        yield ""

    monkeypatch.setattr(runner, "run_stream", fake_run_stream)
    # get_chat_model is lru_cached and reads env; stub it so no gateway is touched.
    monkeypatch.setattr(runner, "get_chat_model", lambda *a, **k: object())
    runner.build_production_runner.cache_clear()

    run_fn = runner.build_production_runner()
    list(run_fn([{"role": "user", "content": "hi"}]))

    assert captured["answer_use_threshold"] == ANSWER_USE_THRESHOLD
    assert callable(captured["gap_match_fn"])
    assert captured["gap_match_threshold"] == runner.GAP_MATCH_THRESHOLD
