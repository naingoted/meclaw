from fastapi.testclient import TestClient

import app.main as main


class StubGraph:
    def __init__(self, final):
        self._final = final

    def invoke(self, state):
        return self._final


def test_chat_streams_answer_with_metadata(monkeypatch):
    final = {
        "draft": "Thet uses Python.",
        "needs_clarification": False,
        "route": "tech",
        "intent": "tech",
        "sources": [{"source": "a.md", "title": "A", "score": 0.8}],
    }
    monkeypatch.setattr(main, "get_graph", lambda: StubGraph(final))

    client = TestClient(main.app)
    response = client.post("/chat", json={"messages": [{"role": "user", "content": "stack?"}]})

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    body = response.text
    assert '"type":"text-start"' in body
    assert "Thet uses Python." in body
    assert '"route":"tech"' in body
    assert body.rstrip().endswith("[DONE]")


def test_chat_streams_clarifying_question(monkeypatch):
    final = {
        "draft": None,
        "needs_clarification": True,
        "clarifying_question": "Which project?",
        "route": "respond",
        "intent": "project",
        "sources": [],
    }
    monkeypatch.setattr(main, "get_graph", lambda: StubGraph(final))

    client = TestClient(main.app)
    response = client.post("/chat", json={"messages": [{"role": "user", "content": "that one"}]})

    assert response.status_code == 200
    assert "Which project?" in response.text


def test_chat_rejects_empty_messages():
    client = TestClient(main.app)
    response = client.post("/chat", json={"messages": []})
    assert response.status_code == 400
