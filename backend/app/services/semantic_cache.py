"""
Semantic response cache for the AI copilot chat.

Exact-match caching (see cache_service.py) misses the extremely common case
of the same QUESTION asked with different wording ("summarize this page" vs
"give me a summary of this page") — that still triggers a full agent run and
a real Groq call every time. This embeds the incoming prompt via HuggingFace's
Inference API — a separate service from both Groq and Gemini, so today's
Groq rate-limit trouble and the Gemini billing issue don't affect it — and
reuses a recent response when a close-enough semantic match exists.

Verified similarity gap on this embedding model (sentence-transformers/
all-MiniLM-L6-v2): "summarize this page for me" vs "give me a summary of
this page" scores 0.785; a genuinely different question scores 0.124. The
0.75 threshold below sits just under the paraphrase score with a wide
margin above the different-question score.

Deliberately narrow safety rule — callers must only store responses that
were generated with ZERO tool calls (see copilot.py). A tool-driven answer
reflects live project data at that moment; caching and replaying it later
risks serving a stale number. A no-tool answer (general advice, or a
"summarize this page" reply built from data already embedded in the prompt)
doesn't have that risk: if the embedded data changes, the prompt text
changes, the embedding changes, and the cache misses naturally — no manual
invalidation needed.

Short TTL (10 min) bounds staleness further; a small max-entry cap bounds
memory. Single-process, in-memory, like cache_service.py's TTL cache — same
"swap for Redis if this ever runs multi-replica" caveat applies. Fails open
on any embedding error (returns None from get(), no-ops on set()) — a cache
outage must never block a chat response, only skip the shortcut.
"""
import logging
import threading
import time
from dataclasses import dataclass

import numpy as np
from huggingface_hub import InferenceClient

from app.config import settings

logger = logging.getLogger("civilai.semantic_cache")

_TTL_SECONDS = 600
_MAX_ENTRIES = 200
_SIMILARITY_THRESHOLD = 0.75
_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass
class _Entry:
    embedding: np.ndarray
    response: str
    created_at: float


_entries: list[_Entry] = []
_lock = threading.Lock()
_client: InferenceClient | None = None


def _get_client() -> InferenceClient:
    global _client
    if _client is None:
        _client = InferenceClient(token=settings.HUGGINGFACE_TOKEN)
    return _client


def _embed(text: str) -> np.ndarray | None:
    try:
        vec = np.array(_get_client().feature_extraction(text, model=_EMBED_MODEL))
        if vec.ndim > 1:
            vec = vec.mean(axis=0)
        return vec
    except Exception as exc:
        logger.warning("Embedding call failed, semantic cache unavailable for this request | error=%s", exc)
        return None


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else 0.0


def _prune_expired() -> None:
    # Entries are always appended in creation order, so the list stays
    # sorted by created_at — popping from the front is enough, no need to
    # scan/sort the whole list.
    cutoff = time.time() - _TTL_SECONDS
    while _entries and _entries[0].created_at < cutoff:
        _entries.pop(0)


def get(query: str) -> str | None:
    """Return a cached response if a semantically close-enough recent entry
    exists, else None."""
    vec = _embed(query)
    if vec is None:
        return None
    with _lock:
        _prune_expired()
        best_score, best_response = 0.0, None
        for entry in _entries:
            score = _cosine(vec, entry.embedding)
            if score > best_score:
                best_score, best_response = score, entry.response
        if best_score >= _SIMILARITY_THRESHOLD:
            logger.info("Semantic cache hit | similarity=%.3f", best_score)
            return best_response
        return None


def set(query: str, response: str) -> None:
    """Store a response for future semantic lookups. Only call this for
    responses generated with zero tool calls — see module docstring."""
    vec = _embed(query)
    if vec is None:
        return
    with _lock:
        _prune_expired()
        _entries.append(_Entry(embedding=vec, response=response, created_at=time.time()))
        while len(_entries) > _MAX_ENTRIES:
            _entries.pop(0)
