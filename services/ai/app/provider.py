"""Provider seam (mirrors lib/ai/provider.ts). Swapping the chat model = edit
this file only.

Base-URL note (spec §9, RESOLVED 2026-05-31 live spike): the Python `anthropic`
SDK (via langchain-anthropic) appends `/v1/messages` to base_url. So
ANTHROPIC_BASE_URL here must be the gateway ROOT WITHOUT a `/v1` suffix —
`https://coding-intl.dashscope.aliyuncs.com/apps/anthropic` — yielding the
effective path `.../apps/anthropic/v1/messages`. NOTE: this differs from the TS
`@ai-sdk/anthropic` provider, which appends only `/messages` and therefore wants
the `/v1`-suffixed value. Reusing the TS `/v1` URL here causes `.../v1/v1/messages`
-> 404.
"""

import os
from copy import deepcopy
from functools import lru_cache

from langchain_anthropic import ChatAnthropic

from app.config import ANTHROPIC_MODEL_DEFAULT


# Gateway models default to thinking mode. Live spike 2026-05-31 verified that
# the Anthropic-compatible constructor `thinking={"type": "disabled"}` removes
# the hidden reasoning block and cuts latency for both qwen3.6-plus and glm-4.7.
_THINKING_OFF: dict = {"thinking": {"type": "disabled"}}


def _thinking_kwargs(thinking: bool) -> dict:
    """Constructor-kwarg fragment controlling thinking mode: empty when thinking
    is allowed, the disable fragment when off."""
    return {} if thinking else deepcopy(_THINKING_OFF)


@lru_cache(maxsize=8)
def get_chat_model(
    model: str | None = None,
    *,
    streaming: bool = False,
    thinking: bool = False,
) -> ChatAnthropic:
    api_key = os.environ["ANTHROPIC_API_KEY"]
    resolved_model = (
        model
        if model is not None
        else os.getenv("ANTHROPIC_MODEL", ANTHROPIC_MODEL_DEFAULT)
    )
    base_url = os.getenv("ANTHROPIC_BASE_URL")

    kwargs: dict = {
        "model": resolved_model,
        "api_key": api_key,
        "streaming": streaming,
    }
    if base_url:
        kwargs["base_url"] = _normalize_base_url(base_url)
    kwargs.update(_thinking_kwargs(thinking))
    return ChatAnthropic(**kwargs)


def _normalize_base_url(base_url: str) -> str:
    """Strip a trailing `/v1` (langchain-anthropic appends `/v1/messages`
    itself). Lets the Python sidecar share the exact gateway URL the TS provider
    uses — which carries `/v1` — without producing `/v1/v1/messages` (→ 404)."""
    trimmed = base_url.rstrip("/")
    if trimmed.endswith("/v1"):
        return trimmed[: -len("/v1")]
    return trimmed
