import re
import time as _time
import logging
from groq import Groq
import instructor
from langsmith import traceable
from app.config import settings
from app.services import usage_tracker

logger = logging.getLogger("civilai.groq")

_FAST_MODEL = "llama-3.3-70b-versatile"
_MAX_AUTO_RETRY_SECS = 15  # only sleep-and-retry for short RPM waits; not TPD exhaustion

# ── Key pool ───────────────────────────────────────────────────────────────────
def _build_key_pool() -> list[str]:
    keys = [settings.GROQ_API_KEY]
    for attr in ("GROQ_API_KEY_2", "GROQ_API_KEY_3"):
        k = getattr(settings, attr, None)
        if k:
            keys.append(k)
    return [k for k in keys if k]

_key_pool = _build_key_pool()
_active_idx = 0
_state: dict = {}


def _activate_key(idx: int) -> None:
    c = Groq(api_key=_key_pool[idx])
    _state["client"] = c
    _state["instructor_client"] = instructor.from_groq(c, mode=instructor.Mode.JSON)

_activate_key(0)


class _Proxy:
    """Forward every attribute access to the currently active client in _state.

    Imported references stay valid across key rotations because the proxy
    object itself never changes — only the underlying client does.
    """
    __slots__ = ("_key",)

    def __init__(self, key: str):
        object.__setattr__(self, "_key", key)

    def __getattr__(self, name: str):
        return getattr(_state[object.__getattribute__(self, "_key")], name)


client = _Proxy("client")
instructor_client = _Proxy("instructor_client")


# ── Rate-limit helpers ─────────────────────────────────────────────────────────
def _rate_limit_wait(exc: Exception) -> float | None:
    """Return seconds to wait if this is a retryable 429, else None."""
    err = str(exc)
    if "429" not in err and "rate_limit_exceeded" not in err:
        return None
    m = re.search(r"try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s", err)
    if not m:
        return None
    minutes = int(m.group(1) or 0)
    seconds = float(m.group(2))
    return minutes * 60 + seconds


def _is_daily_limit(exc: Exception) -> bool:
    """True when the error is a tokens-per-day (TPD) exhaustion, not an RPM limit."""
    err = str(exc)
    return "rate_limit_exceeded" in err and "tokens per day" in err.lower()


def _is_unrecoverable_rate_limit(exc: Exception) -> bool:
    """True for rate-limit errors that waiting can't fix — e.g. a single request
    (413, tokens-per-minute) that exceeds the bucket outright. Same org quota
    on both keys means rotating won't help either, so this goes straight to the
    Gemini fallback."""
    err = str(exc)
    return "rate_limit_exceeded" in err and "tokens per minute" in err.lower()


def _gemini_fallback(messages: list) -> str:
    """Last-resort tier after every Groq key is rate-limited/exhausted — routes
    the same conversation through Gemini so callers still get a real answer
    instead of an error string."""
    from app.ai.gemini_client import text_completion
    system = "\n\n".join(m["content"] for m in messages if m.get("role") == "system")
    user = "\n\n".join(m["content"] for m in messages if m.get("role") != "system")
    logger.warning("[GROQ] All keys rate-limited/exhausted — falling back to Gemini")
    return text_completion(user, system=system or None)


def _rotate_key() -> bool:
    """Promote to the next API key. Returns False when all keys are exhausted."""
    global _active_idx
    logger.warning(
        "[GROQ] Key #%d daily token limit reached — trying next key.", _active_idx + 1
    )
    next_idx = _active_idx + 1
    if next_idx >= len(_key_pool):
        logger.error(
            "[GROQ] All %d API key(s) have hit their daily token limit. "
            "CivilAI AI features will be unavailable until quota resets (~midnight UTC).",
            len(_key_pool),
        )
        return False
    _active_idx = next_idx
    _activate_key(_active_idx)
    logger.info("[GROQ] Rotated to API key #%d", _active_idx + 1)
    return True


def get_active_key() -> str:
    """Currently active Groq API key — lets other Groq clients (e.g. the
    LangChain-based ReAct agent in agent_copilot.py) stay in sync with rotation
    decisions made here, instead of each keeping an independent, stale key."""
    return _key_pool[_active_idx]


def rotate_key() -> bool:
    """Public wrapper — advance to the next pooled key. False if none remain."""
    return _rotate_key()


# ── Core chat call ─────────────────────────────────────────────────────────────
@traceable(name="groq-chat", run_type="llm", metadata={"provider": "groq"})
def chat(messages: list, model: str = _FAST_MODEL, _rpm_attempt: int = 0) -> str:
    try:
        response = _state["client"].chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
        )
        if response.usage:
            usage_tracker.add_llm_tokens(response.usage.total_tokens)
        return response.choices[0].message.content
    except Exception as exc:
        if _is_daily_limit(exc):
            if _rotate_key():
                # Reset RPM counter so the new key gets its own retry budget
                return chat(messages, model, _rpm_attempt=0)
            try:
                return _gemini_fallback(messages)
            except Exception:
                raise RuntimeError(
                    "CivilAI Copilot is temporarily unavailable: all Groq API keys "
                    "have reached their daily token limit and the Gemini fallback "
                    "also failed. Please try again after midnight UTC."
                ) from exc
        if _is_unrecoverable_rate_limit(exc):
            try:
                return _gemini_fallback(messages)
            except Exception:
                raise RuntimeError(
                    "CivilAI Copilot is temporarily unavailable: the Groq request "
                    "exceeded its per-minute token budget and the Gemini fallback "
                    "also failed. Please try again shortly."
                ) from exc
        wait = _rate_limit_wait(exc)
        if wait is not None and wait <= _MAX_AUTO_RETRY_SECS and _rpm_attempt == 0:
            logger.warning("Groq rate limited — waiting %.1fs then retrying", wait)
            _time.sleep(wait + 0.5)
            return chat(messages, model, _rpm_attempt=1)
        if _rpm_attempt > 0 or wait is None:
            # Retry already used (or not retryable) — try Gemini before giving up.
            try:
                return _gemini_fallback(messages)
            except Exception:
                pass
        raise


def chat_stream(messages: list, model: str = _FAST_MODEL, _rpm_attempt: int = 0):
    """Yields text deltas as they arrive from Groq. Key rotation only applies before
    the stream starts — a failure mid-stream just ends the generator early and lets
    the caller's accumulated partial text stand (better than losing it outright)."""
    try:
        stream = _state["client"].chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
            stream=True,
            stream_options={"include_usage": True},
        )
    except Exception as exc:
        if _is_daily_limit(exc):
            if _rotate_key():
                yield from chat_stream(messages, model, _rpm_attempt=0)
                return
            yield from _gemini_fallback_stream(messages)
            return
        if _is_unrecoverable_rate_limit(exc):
            yield from _gemini_fallback_stream(messages)
            return
        wait = _rate_limit_wait(exc)
        if wait is not None and wait <= _MAX_AUTO_RETRY_SECS and _rpm_attempt == 0:
            logger.warning("Groq rate limited — waiting %.1fs then retrying", wait)
            _time.sleep(wait + 0.5)
            yield from chat_stream(messages, model, _rpm_attempt=1)
            return
        if _rpm_attempt > 0 or wait is None:
            yield from _gemini_fallback_stream(messages)
            return
        raise

    for chunk in stream:
        if chunk.usage:
            usage_tracker.add_llm_tokens(chunk.usage.total_tokens)
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def _gemini_fallback_stream(messages: list):
    """Streaming counterpart to _gemini_fallback: Groq is unavailable, so fetch
    the full answer from Gemini and drip it out word-by-word to preserve the
    caller's incremental-rendering UX."""
    try:
        text = _gemini_fallback(messages)
    except Exception as exc:
        raise RuntimeError(
            "CivilAI Copilot is temporarily unavailable: Groq is rate-limited "
            "and the Gemini fallback also failed. Please try again shortly."
        ) from exc
    words = text.split(" ")
    for i, word in enumerate(words):
        yield word if i == 0 else " " + word


def get_key_pool_size() -> int:
    return len(_key_pool)


_ANALYZE_SYSTEM = """\
You are CivilAI, an expert AI assistant for construction management. \
Your audience is project directors, senior engineers, and quantity surveyors.

Always structure your response using bold section headings followed by bullet points. \
Never write walls of prose. Use this pattern:

**[Section Heading]**
- [Technical bullet with specific values, percentages, dates, or clause references]
- [Another bullet]

**[Next Section Heading]**
- [Bullet]

Use domain-specific terminology: CPM, EVM, CPI, SPI, EAC, BAC, ITP, NCR, RFI, LOD, SOV, PCO, \
GMP, retention, LD, DAB, FIDIC 2017, NEC4, OSHA 29 CFR 1926, IBC 2021, ACI 318-19, ISO 19650. \
Quote specific numbers from the data. Flag safety-critical findings under a **Safety Alert** heading.\
"""


@traceable(name="groq-analyze-document", run_type="llm", metadata={"provider": "groq"})
def analyze_document(text: str, prompt: str) -> str:
    messages = [
        {"role": "system", "content": _ANALYZE_SYSTEM},
        {"role": "user",   "content": f"{prompt}\n\nDocument:\n{text}"},
    ]
    return chat(messages)
