"""Manual spike (Spec A §7.1): does the gateway model support native tool-calling?

Run with live creds:  uv run python scripts/spike_tool_calling.py
NOT a CI test — makes live gateway calls. Records the answer that gates U2/U3.
"""

from __future__ import annotations

import json

from langchain_core.tools import tool

from app.provider import get_chat_model


@tool
def get_weather(city: str) -> str:
    """Return the weather for a city. (Stub — the spike only checks tool-call wiring.)"""
    return f"sunny in {city}"


def main() -> None:
    model = get_chat_model(streaming=False, thinking=False)

    print("=== A. Native bind_tools (thinking OFF) ===")
    try:
        bound = model.bind_tools([get_weather])
        resp = bound.invoke(
            [
                {
                    "role": "user",
                    "content": "What's the weather in Singapore? Use the tool.",
                }
            ]
        )
        calls = getattr(resp, "tool_calls", None)
        print("tool_calls:", json.dumps(calls, indent=2, default=str))
        print("content:", resp.content)
        print("RESULT_A:", "PASS" if calls else "NO_TOOL_CALLS")
    except Exception as exc:  # noqa: BLE001 — spike: capture the exact failure
        print("RESULT_A: ERROR", type(exc).__name__, exc)

    print("\n=== B. Native bind_tools (thinking ON) ===")
    try:
        model_t = get_chat_model(streaming=False, thinking=True)
        resp = model_t.bind_tools([get_weather]).invoke(
            [
                {
                    "role": "user",
                    "content": "What's the weather in Singapore? Use the tool.",
                }
            ]
        )
        calls = getattr(resp, "tool_calls", None)
        print("tool_calls:", json.dumps(calls, indent=2, default=str))
        print("RESULT_B:", "PASS" if calls else "NO_TOOL_CALLS")
    except Exception as exc:  # noqa: BLE001
        print("RESULT_B: ERROR", type(exc).__name__, exc)


if __name__ == "__main__":
    main()
