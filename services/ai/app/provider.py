"""Provider seam (mirrors lib/ai/provider.ts). Swapping the chat model = edit
this file only.

Base-URL note (spec §9): ANTHROPIC_BASE_URL must resolve so the effective
request path is `.../apps/anthropic/v1/messages`. Verified resolved value: <fill
in after the local spike>.
"""

import os
from functools import lru_cache

from langchain_anthropic import ChatAnthropic

from app.config import ANTHROPIC_MODEL_DEFAULT


@lru_cache(maxsize=1)
def get_chat_model(streaming: bool = False) -> ChatAnthropic:
    api_key = os.environ["ANTHROPIC_API_KEY"]
    model = os.getenv("ANTHROPIC_MODEL", ANTHROPIC_MODEL_DEFAULT)
    base_url = os.getenv("ANTHROPIC_BASE_URL")

    kwargs: dict = {"model": model, "api_key": api_key, "streaming": streaming}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatAnthropic(**kwargs)
