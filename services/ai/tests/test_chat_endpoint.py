from fastapi.testclient import TestClient

import app.main as main


def _stub_runner(frames):
    def _run(messages):
        captured["messages"] = messages
        yield from frames

    return _run


captured: dict = {}


def test_chat_passes_runner_stream_through(monkeypatch):
    frames = [
        'data: {"type":"data-status","data":{"label":"Routing…","stage":"triage"},"transient":true}\n\n',
        'data: {"type":"start","messageMetadata":{"route":"tech"}}\n\n',
        'data: {"type":"text-start","id":"0"}\n\n',
        'data: {"type":"text-delta","id":"0","delta":"Thet uses Python."}\n\n',
        'data: {"type":"text-end","id":"0"}\n\n',
        'data: {"type":"finish","messageMetadata":{"route":"tech"}}\n\n',
        "data: [DONE]\n\n",
    ]
    monkeypatch.setattr(main, "get_runner", lambda: _stub_runner(frames))

    client = TestClient(main.app)
    response = client.post("/chat", json={"messages": [{"role": "user", "content": "stack?"}]})

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    body = response.text
    assert '"type":"data-status"' in body
    assert '"delta":"Thet uses Python."' in body
    assert '"route":"tech"' in body
    assert body.rstrip().endswith("[DONE]")
    # the runner receives the request messages as plain dicts
    assert captured["messages"] == [{"role": "user", "content": "stack?"}]


def test_chat_rejects_empty_messages():
    client = TestClient(main.app)
    response = client.post("/chat", json={"messages": []})
    assert response.status_code == 400
