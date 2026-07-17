import time
import threading
import logging
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("civilai.rate_limiter")

_SKIP_PATHS = frozenset({"/", "/health", "/docs", "/redoc", "/openapi.json"})

_AI_PREFIXES = (
    "/api/v1/copilot/chat",
    "/api/v1/documents/upload",
    "/api/v1/documents/ask",
    "/api/v1/bim/analyze",
    "/api/v1/writing",
    "/api/v1/reports",
    "/api/v1/contracts/analyze",
    "/api/v1/safety/analyze",
    "/api/v1/transcribe",
    "/api/v1/agent/chat",
    "/api/v1/agent/stream",
    "/api/v1/agent/upload",
)

_AI_LIMIT = 10
_GENERAL_LIMIT = 60
_WINDOW_SECONDS = 60


# ---------------------------------------------------------------------------
# Backend implementations
# ---------------------------------------------------------------------------

class _InMemoryBackend:
    """Sliding-window counter using an in-process deque. Single-instance only."""

    def __init__(self):
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check_and_increment(self, key: str, limit: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - _WINDOW_SECONDS
        with self._lock:
            dq = self._store[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= limit:
                retry_after = int(_WINDOW_SECONDS - (now - dq[0])) + 1
                return True, retry_after
            dq.append(now)
            return False, 0


class _RedisBackend:
    """Sliding-window counter using Redis sorted sets. Safe across multiple pods."""

    def __init__(self, redis_url: str):
        import redis as redis_lib
        self._redis = redis_lib.from_url(redis_url, decode_responses=True)
        self._redis.ping()   # raise immediately if Redis is unreachable
        logger.info("Rate limiter: Redis backend connected at %s", redis_url)

    def check_and_increment(self, key: str, limit: int) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - _WINDOW_SECONDS
        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(key, "-inf", cutoff)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, _WINDOW_SECONDS + 5)
        results = pipe.execute()
        count_before = results[1]
        if count_before >= limit:
            oldest = self._redis.zrange(key, 0, 0, withscores=True)
            retry_after = int(_WINDOW_SECONDS - (now - oldest[0][1])) + 1 if oldest else _WINDOW_SECONDS
            # undo the zadd we just did — this key was already over limit
            self._redis.zrem(key, str(now))
            return True, retry_after
        return False, 0


def _build_backend():
    from app.config import settings
    if settings.REDIS_URL:
        try:
            return _RedisBackend(settings.REDIS_URL)
        except Exception as exc:
            logger.warning("Redis unavailable (%s) — falling back to in-memory rate limiter", exc)
    else:
        logger.info("Rate limiter: no REDIS_URL set, using in-memory backend (single-instance only)")
    return _InMemoryBackend()


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class RateLimiterMiddleware(BaseHTTPMiddleware):

    def __init__(self, app):
        super().__init__(app)
        self._backend = _build_backend()

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in _SKIP_PATHS:
            return await call_next(request)

        is_ai = path.startswith(_AI_PREFIXES)
        limit = _AI_LIMIT if is_ai else _GENERAL_LIMIT
        ip = self._client_ip(request)
        key = f"rl:{ip}:{path}"

        limited, retry_after = self._backend.check_and_increment(key, limit)
        if limited:
            logger.warning(
                "Rate limit exceeded | ip=%s | path=%s | limit=%d/min",
                ip, path, limit,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please slow down.",
                    "limit": f"{limit} requests per {_WINDOW_SECONDS}s",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
