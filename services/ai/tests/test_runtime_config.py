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


def test_resolve_config_reads_score_floor_and_cluster_radius():
    from app.runtime_config import resolve_config

    cfg = resolve_config({"rag": {"topK": 6, "scoreFloor": 0.5, "clusterRadius": 0.2}})
    assert cfg.score_floor == 0.5
    assert cfg.cluster_radius == 0.2


def test_resolve_config_defaults_gap_tunables(monkeypatch):
    from app.runtime_config import resolve_config

    monkeypatch.delenv("RAG_SCORE_FLOOR", raising=False)
    monkeypatch.delenv("CLUSTER_RADIUS", raising=False)
    cfg = resolve_config({})
    assert cfg.score_floor == 0.35
    assert cfg.cluster_radius == 0.15


def test_resolve_reads_score_threshold_gap_match_and_confidence(monkeypatch):
    monkeypatch.delenv("TRIAGE_CONFIDENCE_THRESHOLD", raising=False)
    cfg = resolve_config(
        {
            "agents": {
                "triage": {
                    "model": "t",
                    "thinking": False,
                    "prompt": "T",
                    "confidence": 0.7,
                }
            },
            "rag": {"topK": 4, "scoreThreshold": 0.25, "gapMatchThreshold": 0.2},
        }
    )
    assert cfg.score_threshold == 0.25
    assert cfg.gap_match_threshold == 0.2
    assert cfg.triage_confidence == 0.7


def test_resolve_reads_public_fields():
    cfg = resolve_config(
        {
            "public": {
                "calUrl": "https://cal.com/owner",
                "githubUrl": "https://github.com/owner",
                "contactEmail": "owner@example.com",
            }
        }
    )
    assert cfg.cal_url == "https://cal.com/owner"
    assert cfg.github_url == "https://github.com/owner"
    assert cfg.contact_email == "owner@example.com"


def test_resolve_defaults_new_fields(monkeypatch):
    monkeypatch.delenv("TRIAGE_CONFIDENCE_THRESHOLD", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_CAL_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_GITHUB_URL", raising=False)
    monkeypatch.delenv("GAP_MATCH_THRESHOLD", raising=False)
    cfg = resolve_config({})
    assert cfg.score_threshold == 0.0
    assert cfg.gap_match_threshold == 0.15
    assert cfg.triage_confidence == 0.5
    assert cfg.cal_url == "https://cal.com/tet-nai"
    assert cfg.github_url == ""
    assert cfg.contact_email == "naingoted@gmail.com"


def test_resolve_ignores_blank_public_overrides(monkeypatch):
    monkeypatch.delenv("NEXT_PUBLIC_CAL_URL", raising=False)
    # empty strings must NOT clobber the working defaults
    cfg = resolve_config(
        {"public": {"calUrl": "", "githubUrl": "", "contactEmail": ""}}
    )
    assert cfg.cal_url == "https://cal.com/tet-nai"
    assert cfg.github_url == ""
    assert cfg.contact_email == "naingoted@gmail.com"


def test_gap_match_threshold_env_fallback(monkeypatch):
    monkeypatch.setenv("GAP_MATCH_THRESHOLD", "0.3")
    cfg = resolve_config({})
    assert cfg.gap_match_threshold == 0.3
    # request value still wins over env
    cfg = resolve_config({"rag": {"gapMatchThreshold": 0.1}})
    assert cfg.gap_match_threshold == 0.1


def test_rag_top_k_default(monkeypatch):
    monkeypatch.delenv("RAG_TOP_K", raising=False)
    cfg = resolve_config({})
    assert cfg.top_k == 3


def test_rag_top_k_env_fallback(monkeypatch):
    monkeypatch.setenv("RAG_TOP_K", "6")
    cfg = resolve_config({})
    assert cfg.top_k == 6
    # request value still wins over env
    cfg = resolve_config({"rag": {"topK": 2}})
    assert cfg.top_k == 2
