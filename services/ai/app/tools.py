"""Agent tools — mirror lib/ai/tools.ts. Same env var names + defaults so TS and
Python configuration stay identical."""

import os

OWNER_EMAIL = "thetnaing@incube8.sg"


def get_contact_info() -> dict[str, str]:
    info = {"email": OWNER_EMAIL}
    github = os.getenv("NEXT_PUBLIC_GITHUB_URL")
    if github:
        info["github"] = github
    return info


def schedule_call() -> dict[str, str]:
    return {"url": os.getenv("NEXT_PUBLIC_CAL_URL", "https://cal.com/tet-nai")}


def show_resume() -> dict[str, str]:
    return {
        "path": "/resume",
        "description": (
            "The resume is available for download at /resume. Offer this link to "
            "the visitor."
        ),
    }


def how_this_works() -> str:
    return (
        "echo is a personal AI twin. Phase 3 runs a Python FastAPI sidecar whose "
        "core is a LangGraph state graph (triage -> specialized agent -> review -> "
        "respond). Knowledge comes from markdown in content/, embedded with Ollama "
        "nomic-embed-text and retrieved from Qdrant. The chat model is qwen3.6-plus "
        "via an Anthropic-compatible gateway. The Next.js app handles the UI, "
        "guardrails, and SQLite persistence."
    )
