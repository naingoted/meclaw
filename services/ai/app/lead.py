"""Lead capture: detect a visitor's email/phone in chat, build the templated
offers shown when the bot can't help, and read prior offer/confirm state from
conversation history. Pure functions, no I/O — persistence and notification live
in the Next.js layer. This module only decides what to say and what to emit."""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# A phone-shaped token: optional +, optional leading paren, a digit, then digits/space/()-/. ,
# ending on a digit. Length is validated separately on the digit count.
_PHONE_RE = re.compile(r"\+?\(?\d[\d\s().-]{5,}\d")


def extract_contact(text: str) -> dict:
    """Return {'email': ...} and/or {'phone': ...} found in `text`; {} if none.
    Email is lowercased. Phone keeps its original formatting but must contain
    7–15 digits (filters years, counts, list indices)."""
    out: dict = {}
    email = _EMAIL_RE.search(text)
    if email:
        out["email"] = email.group(0).lower()
    # Remove any email first so its local-part digits can't match the phone regex.
    phone_text = _EMAIL_RE.sub(" ", text)
    for match in _PHONE_RE.finditer(phone_text):
        digits = re.sub(r"\D", "", match.group(0))
        if 7 <= len(digits) <= 15:
            out["phone"] = match.group(0)
            break
    return out


def format_contact(contact: dict) -> str:
    parts = [contact[k] for k in ("email", "phone") if contact.get(k)]
    return " / ".join(parts)


# --- Templated offers + confirmation ---------------------------------------

SOFT_OFFER = (
    "I'm not certain about that one. If you'd like, drop your email or phone "
    "and I'll have Thet follow up directly."
)
CONNECT_OFFER = (
    "Prefer he reach out to you? Share your email or phone and I'll pass it "
    "straight to him."
)
ESCALATED_OFFER = (
    "I still can't answer that one well. The fastest path is to leave your "
    "email or phone — Thet will get back to you personally."
)
# Used when contact was ALREADY captured this conversation: acknowledge the miss
# without nagging for contact again.
NEUTRAL_FALLBACK = (
    "I'm still not certain about that one — Thet will be in touch using the "
    "details you shared."
)


def confirm(contact: dict) -> str:
    return (
        f"Got it — I'll make sure Thet follows up at {format_contact(contact)}. "
        "Anything else I can try in the meantime?"
    )


# Distinct substrings used to recognize each offer/confirm in history. Keep in
# sync with the templates above.
_OFFER_MARKERS = {
    "edge_case": "have Thet follow up directly",
    "connect_intent": "pass it straight to him",
    "repeated_dead_end": "get back to you personally",
}
CONFIRM_MARKER = "make sure Thet follows up"


def _assistant_texts(messages: list[dict]) -> list[str]:
    return [str(m.get("content", "")) for m in messages if m.get("role") == "assistant"]


def has_prior_confirm(messages: list[dict]) -> bool:
    return any(CONFIRM_MARKER in t for t in _assistant_texts(messages))


def prior_offer_made(messages: list[dict]) -> bool:
    markers = _OFFER_MARKERS.values()
    return any(any(m in t for m in markers) for t in _assistant_texts(messages))


def most_recent_offer_trigger(messages: list[dict]) -> str | None:
    for text in reversed(_assistant_texts(messages)):
        for trigger, marker in _OFFER_MARKERS.items():
            if marker in text:
                return trigger
    return None


def prior_user_question(messages: list[dict]) -> str:
    """The most recent user message BEFORE the contact reply (the latest user
    message is the contact itself). Empty if the visitor volunteered contact
    with no prior question."""
    users = [str(m.get("content", "")) for m in messages if m.get("role") == "user"]
    return users[-2] if len(users) >= 2 else ""
