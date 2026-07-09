"""Short-TTL cache for read-heavy, expensive-to-recompute GET endpoints
(dashboard KPI/chart aggregates in particular).

Every open dashboard tab, every widget, and every project/timeline filter
change re-runs the same Supabase aggregation queries. The underlying tables
don't change that often relative to how often these endpoints are polled, so
a short TTL absorbs the redundant load without materially affecting
freshness: dashboards are conventionally "near real-time" (15-60s is a common
industry SLA, not sub-second), and genuine writes are still surfaced promptly
on the frontend via the Supabase Realtime -> refetch path, independent of
this cache's TTL.

This is a single-process, in-memory cache (like the in-memory fallback in
app/middleware/rate_limiter.py) — each backend instance caches independently.
That's an acceptable tradeoff at this scale; if the API is ever run as
multiple replicas behind a load balancer, swap this for a Redis-backed cache
(same pattern as the rate limiter) so all instances agree.
"""
import threading
from functools import wraps
from typing import Callable

from cachetools import TTLCache

_TTL_SECONDS = 15
_MAX_ENTRIES = 512

_cache: TTLCache = TTLCache(maxsize=_MAX_ENTRIES, ttl=_TTL_SECONDS)
_lock = threading.Lock()


def cached_response(fn: Callable) -> Callable:
    """Cache a GET endpoint's return value for a few seconds, keyed by its
    function and query-parameter values. FastAPI always calls path operation
    functions with keyword arguments, so the query params are exactly `kwargs`."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        key = f"{fn.__module__}.{fn.__name__}|{sorted(kwargs.items())!r}"
        with _lock:
            if key in _cache:
                return _cache[key]
        result = fn(*args, **kwargs)
        with _lock:
            _cache[key] = result
        return result

    return wrapper


def clear_cache() -> None:
    """Drop every cached entry. Call this after a write that dashboard
    aggregates depend on, if you need the next read to be guaranteed-fresh
    rather than waiting out the TTL."""
    with _lock:
        _cache.clear()
