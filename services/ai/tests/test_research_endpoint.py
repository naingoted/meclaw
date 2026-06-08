from fastapi.testclient import TestClient

import app.main as main

captured: dict = {}


def _stub_streamer(req):
    captured["req"] = req
    yield 'data: {"type":"start"}\n\n'
    yield 'data: {"type":"data-status","data":{"label":"Planning research","stage":"plan"},"transient":true}\n\n'
    yield 'data: {"type":"data-report","data":{"report":{"summary":"ok"},"status":"done"}}\n\n'
    yield 'data: {"type":"finish","messageMetadata":{"status":"done"}}\n\n'
    yield "data: [DONE]\n\n"


def test_research_streams_status_and_report(monkeypatch):
    monkeypatch.setattr(main, "get_research_streamer", lambda: _stub_streamer)

    client = TestClient(main.app)
    response = client.post("/research", json={"company": "Acme", "role": "Backend"})

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    body = response.text
    assert '"type":"data-status"' in body
    assert '"type":"data-report"' in body
    assert body.rstrip().endswith("[DONE]")
    assert captured["req"] == {"company": "Acme", "role": "Backend"}


def test_research_rejects_empty_request():
    client = TestClient(main.app)
    response = client.post("/research", json={})
    assert response.status_code == 400


def test_research_rejects_whitespace_only_request():
    client = TestClient(main.app)
    response = client.post("/research", json={"company": "   ", "role": "\n\t"})
    assert response.status_code == 400
