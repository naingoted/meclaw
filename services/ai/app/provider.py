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
from functools import lru_cache

from langchain_anthropic import ChatAnthropic

from app.config import ANTHROPIC_MODEL_DEFAULT


@lru_cache(maxsize=2)
def get_chat_model(streaming: bool = False) -> ChatAnthropic:
    api_key = os.environ["ANTHROPIC_API_KEY"]
    model = os.getenv("ANTHROPIC_MODEL", ANTHROPIC_MODEL_DEFAULT)
    base_url = os.getenv("ANTHROPIC_BASE_URL")

    kwargs: dict = {"model": model, "api_key": api_key, "streaming": streaming}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatAnthropic(**kwargs)
