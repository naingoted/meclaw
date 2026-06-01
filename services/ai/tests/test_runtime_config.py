from app.runtime_config import resolve_config


def test_resolve_prefers_request_then_env(monkeypatch):
    monkeypatch.setenv("TRIAGE_MODEL", "env-triage")
    monkeypatch.setenv("DRAFT_MODEL", "env-draft")
    monkeypatch.setenv("RAG_TOP_K", "4")
    cfg = resolve_config(
        {
            "agents": {
                "triage": {"model": "req-triage", "thinking": False, "prompt": "T"},
                "knowledge": {"model": "req-draft", "thinking": False, "prompt": "K"},
            },
            "shared": {"persona": "P"},
            "rag": {"topK": 7},
        }
    )
    assert cfg.triage_model == "req-triage"
    assert cfg.draft_model == "req-draft"
    assert cfg.top_k == 7
    assert cfg.persona == "P"
    assert cfg.prompts["triage"] == "T"
    assert cfg.prompts["knowledge"] == "K"


def test_resolve_ignores_unknown_agents_and_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("TRIAGE_MODEL", "env-triage")
    monkeypatch.setenv("DRAFT_MODEL", "env-draft")
    monkeypatch.setenv("RAG_TOP_K", "5")
    cfg = resolve_config(
        {
            "agents": {
                "beeaiPlanner": {
                    "model": "x",
                    "thinking": False,
                    "prompt": "p",
                    "framework": "beeai",
                }
            }
        }
    )
    assert cfg.triage_model == "env-triage"
    assert cfg.draft_model == "env-draft"
    assert cfg.top_k == 5
    assert cfg.persona == ""
    assert cfg.prompts == {}
