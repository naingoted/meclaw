from app.lead import (
    extract_contact,
    format_contact,
    confirm,
    has_prior_confirm,
    prior_offer_made,
    most_recent_offer_trigger,
    prior_user_question,
    SOFT_OFFER,
    CONNECT_OFFER,
    ESCALATED_OFFER,
)


def test_extract_email():
    assert extract_contact("reach me at Jane.Doe@Acme.com please") == {
        "email": "jane.doe@acme.com"
    }


def test_extract_phone_international():
    assert extract_contact("call +65 9123 4567") == {"phone": "+65 9123 4567"}


def test_extract_phone_with_parens_and_dashes():
    assert extract_contact("number is (415) 555-2671") == {"phone": "(415) 555-2671"}


def test_extract_both():
    out = extract_contact("jane@acme.com or 912-345-678")
    assert out["email"] == "jane@acme.com"
    assert out["phone"] == "912-345-678"


def test_extract_none_in_prose():
    assert extract_contact("tell me about his work in 2024") == {}


def test_extract_ignores_short_digit_runs():
    # "top 5 projects" / a year alone is not a phone (fewer than 7 digits)
    assert extract_contact("show me his top 5 projects from 2024") == {}


def test_format_contact_both():
    assert format_contact({"email": "j@a.com", "phone": "+65 1"}) == "j@a.com / +65 1"


def test_confirm_includes_contact():
    msg = confirm({"email": "j@a.com"})
    assert "j@a.com" in msg
    assert "make sure Thet follows up" in msg


def test_history_helpers_detect_offer_and_confirm():
    history = [
        {"role": "user", "content": "obscure question"},
        {"role": "assistant", "content": SOFT_OFFER},
    ]
    assert prior_offer_made(history) is True
    assert has_prior_confirm(history) is False
    assert most_recent_offer_trigger(history) == "edge_case"


def test_most_recent_offer_trigger_maps_each_template():
    assert (
        most_recent_offer_trigger([{"role": "assistant", "content": CONNECT_OFFER}])
        == "connect_intent"
    )
    assert (
        most_recent_offer_trigger([{"role": "assistant", "content": ESCALATED_OFFER}])
        == "repeated_dead_end"
    )
    assert most_recent_offer_trigger([{"role": "assistant", "content": "hi"}]) is None


def test_prior_user_question_returns_message_before_contact():
    history = [
        {"role": "user", "content": "what's his salary?"},
        {"role": "assistant", "content": SOFT_OFFER},
        {"role": "user", "content": "jane@acme.com"},
    ]
    assert prior_user_question(history) == "what's his salary?"
