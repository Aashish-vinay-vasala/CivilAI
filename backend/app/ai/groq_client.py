import re
import time as _time
import logging
from groq import Groq
import instructor
from langsmith import traceable
from app.config import settings

logger = logging.getLogger("civilai.groq")

_FAST_MODEL = "llama-3.3-70b-versatile"
_MAX_AUTO_RETRY_SECS = 15  # only sleep-and-retry for short RPM waits; not TPD exhaustion

# ── Key pool ───────────────────────────────────────────────────────────────────
def _build_key_pool() -> list[str]:
    keys = [settings.GROQ_API_KEY]
    k2 = getattr(settings, "GROQ_API_KEY_2", None)
    if k2:
        keys.append(k2)
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


def _rotate_key() -> bool:
    """Promote to the next API key. Returns False when all keys are exhausted."""
    global _active_idx
    if _active_idx == 0:
        logger.warning(
            "[GROQ] Key 1 daily token limit reached — "
            "half of today's quota is done. Switching to backup key 2."
        )
    next_idx = _active_idx + 1
    if next_idx >= len(_key_pool):
        logger.error(
            "[GROQ] All API keys have hit their daily token limit. "
            "CivilAI AI features will be unavailable until quota resets (~midnight UTC)."
        )
        return False
    _active_idx = next_idx
    _activate_key(_active_idx)
    logger.info("[GROQ] Rotated to API key #%d", _active_idx + 1)
    return True


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
        return response.choices[0].message.content
    except Exception as exc:
        if _is_daily_limit(exc):
            if _rotate_key():
                # Reset RPM counter so the new key gets its own retry budget
                return chat(messages, model, _rpm_attempt=0)
            raise RuntimeError(
                "CivilAI Copilot is temporarily unavailable: all Groq API keys have "
                "reached their daily token limit. Please try again after midnight UTC."
            ) from exc
        wait = _rate_limit_wait(exc)
        if wait is not None and wait <= _MAX_AUTO_RETRY_SECS and _rpm_attempt == 0:
            logger.warning("Groq rate limited — waiting %.1fs then retrying", wait)
            _time.sleep(wait + 0.5)
            return chat(messages, model, _rpm_attempt=1)
        raise


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
