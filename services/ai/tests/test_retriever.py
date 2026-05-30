from app import config
from app.retriever import Retriever, RetrievedChunk


def test_constants_match_ingest_contract():
    # Guards against cross-language drift (spec §10).
    assert config.QDRANT_COLLECTION == "echo_clone_knowledge"
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
