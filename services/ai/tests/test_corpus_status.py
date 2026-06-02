from fastapi.testclient import TestClient

from app.main import app


def test_corpus_status_returns_state(monkeypatch):
    monkeypatch.setattr(
        "app.main.corpus_state",
        lambda: {
            "version": 7,
            "documents": 6,
            "chunks": 19,
            "lastIngestedAt": "2026-06-02T18:00:00+00:00",
            "embedModel": "nomic-embed-text",
        },
    )
    res = TestClient(app).get("/corpus-status")
    assert res.status_code == 200
    assert res.json()["version"] == 7
    assert res.json()["embedModel"] == "nomic-embed-text"
