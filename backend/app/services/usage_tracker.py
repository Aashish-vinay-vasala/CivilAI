"""
In-memory daily usage counters for the copilot's AI calls — powers the widget's
"Usage" gauges (tokens, images, audio, web search).

None of these providers expose a "quota remaining" API, so this tracks what WE'VE
actually sent/consumed today and compares it against limits configured below. Resets
automatically at UTC midnight. Deliberately in-memory (not persisted) — it resets on
backend restart, same as the Groq key-rotation state in groq_client.py, and that's an
acceptable trade-off for an estimate/visualization feature.

Adjust the *_LIMIT constants to match your actual provider plan if you know the real
numbers — these are reasonable placeholders otherwise.
"""
import threading
from datetime import datetime, timezone

GROQ_DAILY_TOKEN_LIMIT_PER_KEY = 100_000   # Groq LLM tokens/day, per API key in the pool
GEMINI_DAILY_IMAGE_LIMIT       = 1_500     # Gemini vision OCR calls/day
GROQ_DAILY_AUDIO_LIMIT         = 100       # Whisper transcription calls/day
WEB_SEARCH_DAILY_LIMIT         = 500       # DuckDuckGo search calls/day

_lock = threading.Lock()
_state = {"date": None, "llm_tokens": 0, "image_calls": 0, "audio_calls": 0, "web_search_calls": 0}


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _ensure_fresh() -> None:
    today = _today()
    if _state["date"] != today:
        _state.update(date=today, llm_tokens=0, image_calls=0, audio_calls=0, web_search_calls=0)


def add_llm_tokens(n: int) -> None:
    if n <= 0:
        return
    with _lock:
        _ensure_fresh()
        _state["llm_tokens"] += n


def add_image_call() -> None:
    with _lock:
        _ensure_fresh()
        _state["image_calls"] += 1


def add_audio_call() -> None:
    with _lock:
        _ensure_fresh()
        _state["audio_calls"] += 1


def add_web_search_call() -> None:
    with _lock:
        _ensure_fresh()
        _state["web_search_calls"] += 1


def get_usage(key_pool_size: int = 1) -> dict:
    with _lock:
        _ensure_fresh()
        token_limit = GROQ_DAILY_TOKEN_LIMIT_PER_KEY * max(1, key_pool_size)
        return {
            "date": _state["date"],
            "llm_tokens": {"used": _state["llm_tokens"],       "limit": token_limit},
            "images":     {"used": _state["image_calls"],      "limit": GEMINI_DAILY_IMAGE_LIMIT},
            "audio":      {"used": _state["audio_calls"],      "limit": GROQ_DAILY_AUDIO_LIMIT},
            "web_search": {"used": _state["web_search_calls"], "limit": WEB_SEARCH_DAILY_LIMIT},
        }


def is_over_budget(key_pool_size: int = 1) -> bool:
    """Hard daily token cap check — unlike get_usage(), which is display-only,
    callers should refuse new LLM work when this returns True instead of just
    showing the number to the user."""
    with _lock:
        _ensure_fresh()
        token_limit = GROQ_DAILY_TOKEN_LIMIT_PER_KEY * max(1, key_pool_size)
        return _state["llm_tokens"] >= token_limit
