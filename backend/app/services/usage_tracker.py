"""
In-memory daily usage counters for the copilot's AI calls — powers the widget's
"Usage" gauges (tokens, images, audio, web search). Each event is also persisted
to Supabase's ai_usage_log table (off-thread, best-effort) so consumption history
survives past the in-memory counters' UTC-midnight/restart reset.

None of these providers expose a "quota remaining" API, so this tracks what WE'VE
actually sent/consumed today and compares it against limits configured below. Resets
automatically at UTC midnight. The in-memory counters are deliberately not persisted
(reset on backend restart, same as the Groq key-rotation state in groq_client.py) —
that's an acceptable trade-off for a same-session estimate/visualization feature;
the Supabase log is the durable record.

Adjust the *_LIMIT constants to match your actual provider plan if you know the real
numbers — these are reasonable placeholders otherwise.
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.services import pricing

logger = logging.getLogger("civilai.usage_tracker")

GROQ_DAILY_TOKEN_LIMIT_PER_KEY = 100_000   # llama-3.3-70b-versatile TPD, per API key in the pool (per console.groq.com/settings/limits)
GEMINI_DAILY_IMAGE_LIMIT       = 1_500     # Gemini vision OCR calls/day
GROQ_DAILY_AUDIO_LIMIT         = 2_000     # whisper-large-v3 RPD, per console.groq.com/settings/limits
WEB_SEARCH_DAILY_LIMIT         = 500       # DuckDuckGo search calls/day

_lock = threading.Lock()
_state = {"date": None, "llm_tokens": 0, "image_calls": 0, "audio_calls": 0, "web_search_calls": 0}

# Callers here range from fully sync (groq_client.chat) to async request handlers —
# a plain thread pool works from either, unlike asyncio.create_task which needs a
# running event loop. Small pool: this is a fire-and-forget audit log, not a queue
# that needs to keep up with heavy throughput.
_log_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="usage-log")


def _persist(
    event_type: str, provider: str, source: str, *,
    model: str | None = None, tokens: int | None = None,
    cost_usd: float | None = None, latency_ms: float | None = None,
) -> None:
    def _write() -> None:
        try:
            from app.services.db_service import supabase
            supabase.table("ai_usage_log").insert({
                "event_type": event_type,
                "provider":   provider,
                "source":     source,
                "model":      model,
                "tokens":     tokens,
                "cost_usd":   cost_usd,
                "latency_ms": round(latency_ms) if latency_ms is not None else None,
            }).execute()
        except Exception as exc:
            logger.warning("Failed to persist usage log | event=%s source=%s error=%s", event_type, source, exc)

    _log_executor.submit(_write)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _ensure_fresh() -> None:
    today = _today()
    if _state["date"] != today:
        _state.update(date=today, llm_tokens=0, image_calls=0, audio_calls=0, web_search_calls=0)


def add_llm_tokens(
    n: int, *, provider: str = "groq", model: str | None = None, source: str = "unknown",
    input_tokens: int | None = None, output_tokens: int | None = None, latency_ms: float | None = None,
) -> None:
    if n <= 0:
        return
    with _lock:
        _ensure_fresh()
        _state["llm_tokens"] += n
    cost = pricing.estimate_cost(provider, model, n, input_tokens, output_tokens)
    _persist("llm_tokens", provider, source, model=model, tokens=n, cost_usd=cost, latency_ms=latency_ms)


def add_image_call(*, provider: str = "gemini", model: str | None = None, source: str = "unknown", latency_ms: float | None = None) -> None:
    with _lock:
        _ensure_fresh()
        _state["image_calls"] += 1
    _persist("image_call", provider, source, model=model, latency_ms=latency_ms)


def add_audio_call(*, provider: str = "groq", model: str | None = None, source: str = "unknown", latency_ms: float | None = None) -> None:
    with _lock:
        _ensure_fresh()
        _state["audio_calls"] += 1
    # Whisper is priced per-hour-of-audio, not per-token — no cheap way to get
    # clip duration at this call site, so cost_usd stays null here rather than
    # guessing from token/file-size proxies.
    _persist("audio_call", provider, source, model=model, latency_ms=latency_ms)


def add_web_search_call(*, provider: str = "duckduckgo", source: str = "unknown", latency_ms: float | None = None) -> None:
    with _lock:
        _ensure_fresh()
        _state["web_search_calls"] += 1
    _persist("web_search_call", provider, source, cost_usd=0.0, latency_ms=latency_ms)


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


def get_usage_from_db(key_pool_size: int = 1) -> dict:
    """Same shape as get_usage(), but sourced from ai_usage_log instead of the
    in-memory counters — accurate across backend restarts (which reset _state
    to zero), which the widget-facing /usage endpoint needs since the backend
    gets restarted far more often than "once a day" during development.
    Falls back to the in-memory snapshot if the query itself fails."""
    today = _today()
    try:
        from app.services.db_service import supabase
        start = f"{today}T00:00:00+00:00"
        rows = (
            supabase.table("ai_usage_log")
            .select("event_type, tokens")
            .gte("created_at", start)
            .execute()
            .data
        ) or []
    except Exception as exc:
        logger.warning("Failed to read usage from DB, falling back to in-memory | error=%s", exc)
        return get_usage(key_pool_size)

    llm_tokens = image_calls = audio_calls = web_search_calls = 0
    for row in rows:
        et = row.get("event_type")
        if et == "llm_tokens":
            llm_tokens += row.get("tokens") or 0
        elif et == "image_call":
            image_calls += 1
        elif et == "audio_call":
            audio_calls += 1
        elif et == "web_search_call":
            web_search_calls += 1

    token_limit = GROQ_DAILY_TOKEN_LIMIT_PER_KEY * max(1, key_pool_size)
    return {
        "date": today,
        "llm_tokens": {"used": llm_tokens,        "limit": token_limit},
        "images":     {"used": image_calls,       "limit": GEMINI_DAILY_IMAGE_LIMIT},
        "audio":      {"used": audio_calls,       "limit": GROQ_DAILY_AUDIO_LIMIT},
        "web_search": {"used": web_search_calls,  "limit": WEB_SEARCH_DAILY_LIMIT},
    }


def is_over_budget(key_pool_size: int = 1) -> bool:
    """Hard daily token cap check — unlike get_usage(), which is display-only,
    callers should refuse new LLM work when this returns True instead of just
    showing the number to the user."""
    with _lock:
        _ensure_fresh()
        token_limit = GROQ_DAILY_TOKEN_LIMIT_PER_KEY * max(1, key_pool_size)
        return _state["llm_tokens"] >= token_limit
