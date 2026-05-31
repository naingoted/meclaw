from app.tools import get_contact_info, schedule_call, show_resume, how_this_works


def test_contact_info_includes_email(monkeypatch):
    monkeypatch.delenv("NEXT_PUBLIC_GITHUB_URL", raising=False)
    assert get_contact_info() == {"email": "naingoted@gmail.com"}


def test_contact_info_includes_github_when_set(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_GITHUB_URL", "https://github.com/thet")
    info = get_contact_info()
    assert info["email"] == "naingoted@gmail.com"
    assert info["github"] == "https://github.com/thet"


def test_schedule_call_default_url(monkeypatch):
    monkeypatch.delenv("NEXT_PUBLIC_CAL_URL", raising=False)
    assert schedule_call() == {"url": "https://cal.com/tet-nai"}


def test_show_resume_path():
    assert show_resume()["path"] == "/resume"


def test_how_this_works_is_nonempty_string():
    assert "echo" in how_this_works().lower()
