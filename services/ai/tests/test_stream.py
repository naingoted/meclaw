from app.stream import (
    SSE_HEADERS,
    sse_data_status,
    sse_done,
    sse_message_metadata,
    sse_text_delta,
    sse_text_end,
    sse_text_start,
)


def test_headers_declare_ui_message_stream():
    assert SSE_HEADERS["content-type"] == "text/event-stream"
    assert SSE_HEADERS["x-vercel-ai-ui-message-stream"] == "v1"


def test_text_part_framing():
    assert sse_text_start("0") == 'data: {"type":"text-start","id":"0"}\n\n'
    assert (
        sse_text_delta("0", "Hello")
        == 'data: {"type":"text-delta","id":"0","delta":"Hello"}\n\n'
    )
    assert sse_text_end("0") == 'data: {"type":"text-end","id":"0"}\n\n'


def test_message_metadata_part():
    out = sse_message_metadata({"sources": [], "route": "tech", "intent": "tech"})
    assert out.startswith('data: {"type":"message-metadata"')
    assert '"route":"tech"' in out
    assert out.endswith("\n\n")


def test_done_terminator():
    assert sse_done() == "data: [DONE]\n\n"


def test_data_status_is_transient_data_part():
    out = sse_data_status("Searching knowledge base…", "retrieval")
    assert out.startswith('data: {"type":"data-status"')
    assert '"label":"Searching knowledge base…"' in out
    assert '"stage":"retrieval"' in out
    assert '"transient":true' in out
    assert out.endswith("\n\n")
