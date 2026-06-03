from app import config
from app.retriever import Retriever, RetrievedChunk


def test_constants_match_ingest_contract():
    # Guards against cross-language drift (spec §10).
    assert config.VECTOR_SIZE == 768
    assert config.DISTANCE == "Cosine"
    assert config.OLLAMA_EMBED_MODEL == "nomic-embed-text"


def test_retrieve_maps_query_to_chunks_and_sources():
    def fake_embed(text: str) -> list[float]:
        assert text == "what is the tech stack"
        return [0.1] * 768

    def fake_search(vector: list[float], limit: int) -> list[dict]:
        assert len(vector) == 768
        assert limit == 4
        return [
            {
                "score": 0.91,
                "payload": {
                    "id": "doc-1#0",
                    "source": "about.md",
                    "title": "About",
                    "text": "Thet uses Next.js and Python.",
                    "ordinal": 0,
                },
            }
        ]

    retriever = Retriever(embed_fn=fake_embed, search_fn=fake_search, top_k=4)
    result = retriever.retrieve("what is the tech stack")

    assert result.chunks == [
        RetrievedChunk(
            id="doc-1#0",
            source="about.md",
            title="About",
            text="Thet uses Next.js and Python.",
            ordinal=0,
            score=0.91,
        )
    ]
    assert result.sources == [{"source": "about.md", "title": "About", "score": 0.91}]


def test_retrieve_empty_query_returns_nothing():
    retriever = Retriever(
        embed_fn=lambda _t: [0.0] * 768,
        search_fn=lambda _v, _l: [],
        top_k=4,
    )
    result = retriever.retrieve("   ")
    assert result.chunks == []
    assert result.sources == []


def test_default_search_builds_cosine_query(monkeypatch):
    import app.retriever as r

    captured = {}

    class FakeCursor:
        def fetchall(self):
            return [("about:0", "about.md", "About", "Thet uses Python.", 0, 0.93)]

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params
            return FakeCursor()

    monkeypatch.setattr(r.psycopg, "connect", lambda url: FakeConn())

    hits = r._default_search([0.1, 0.2, 0.3], 4)

    assert "rag_chunks" in captured["sql"]
    assert "<=>" in captured["sql"]
    assert captured["params"][0] == "[0.1,0.2,0.3]"   # text-cast vector literal
    assert captured["params"][-1] == 4                # limit
    assert hits[0]["payload"]["source"] == "about.md"
    assert hits[0]["payload"]["id"] == "about:0"
    assert hits[0]["score"] == 0.93


def test_embed_is_public_and_delegates_to_embed_fn():
    from app.retriever import Retriever

    calls = {}

    def fake_embed(text):
        calls["text"] = text
        return [0.1, 0.2, 0.3]

    retriever = Retriever(embed_fn=fake_embed, search_fn=lambda v, k: [])
    assert retriever.embed("hello") == [0.1, 0.2, 0.3]
    assert calls["text"] == "hello"
