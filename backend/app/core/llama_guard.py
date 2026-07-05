"""
LlamaGuard 3 integration via Groq API.

Groq hosts llama-guard-3-8b which classifies messages as safe/unsafe
without requiring a local GPU. Both user inputs and assistant outputs
can be screened.
"""
from groq import Groq
from app.config import settings

_MODEL = "llama-guard-3-8b"

# LlamaGuard 3 hazard taxonomy
_CATEGORIES: dict[str, str] = {
    "S1":  "Violent Crimes",
    "S2":  "Non-Violent Crimes",
    "S3":  "Sex-Related Crimes",
    "S4":  "Child Sexual Exploitation",
    "S5":  "Defamation",
    "S6":  "Specialized Advice (legal / medical / financial)",
    "S7":  "Privacy Violation",
    "S8":  "Intellectual Property",
    "S9":  "Weapons of Mass Destruction",
    "S10": "Hate Speech",
    "S11": "Suicide & Self-Harm",
    "S12": "Sexual Content",
    "S13": "Elections",
}

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


def _parse_result(raw: str) -> tuple[bool, str | None]:
    """Parse LlamaGuard output into (is_safe, human_readable_category)."""
    text = raw.strip().lower()
    if text.startswith("safe"):
        return True, None
    lines = raw.strip().splitlines()
    code = lines[1].strip() if len(lines) > 1 else ""
    label = _CATEGORIES.get(code, f"Policy violation ({code})" if code else "Policy violation")
    return False, label


def check_input(user_message: str) -> tuple[bool, str | None]:
    """
    Screen a user message before it reaches the main LLM.
    Returns (is_safe, violation_label). Fails open on API errors.
    """
    try:
        response = _get_client().chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=20,
        )
        return _parse_result(response.choices[0].message.content)
    except Exception:
        # Fail open — a guardrail outage must not block legitimate users
        return True, None


def check_output(user_message: str, assistant_response: str) -> tuple[bool, str | None]:
    """
    Screen the assistant's response before it reaches the user.
    Returns (is_safe, violation_label). Fails open on API errors.
    """
    try:
        response = _get_client().chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "user",      "content": user_message},
                {"role": "assistant", "content": assistant_response},
            ],
            max_tokens=20,
        )
        return _parse_result(response.choices[0].message.content)
    except Exception:
        return True, None
