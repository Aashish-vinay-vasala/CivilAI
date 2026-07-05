"""
Zep conversation memory — persistent, searchable chat history.

Zep Community Edition is free and self-hosted (Docker).
Zep complements chatbot_memory.py (Supabase session logs) by adding:
  - Semantic search over full conversation history
  - Automatic fact/entity extraction and session summarisation
  - Long-term user profile construction

Required packages (free / open-source):
  zep-python

Self-hosted quickstart (Zep Community Edition — free):
  git clone https://github.com/getzep/zep && cd zep
  docker compose up -d          # default URL: http://localhost:8000

Or use Zep Cloud (free tier): https://www.getzep.com

Required env vars (at least one):
  ZEP_BASE_URL   Self-hosted Zep URL, e.g. http://localhost:8000
  ZEP_API_KEY    Zep Cloud API key (omit for self-hosted)
"""
import logging
import os
from typing import Optional

logger = logging.getLogger("civilai.zep")

_ZEP_BASE_URL = os.getenv("ZEP_BASE_URL", "")
_ZEP_API_KEY  = os.getenv("ZEP_API_KEY",  "")

_client: Optional[object] = None


def _get_client() -> Optional[object]:
    global _client
    if _client is not None:
        return _client
    if not _ZEP_BASE_URL and not _ZEP_API_KEY:
        return None
    try:
        from zep_python.client import AsyncZep  # type: ignore[import-untyped]
        kwargs: dict = {}
        if _ZEP_BASE_URL:
            kwargs["base_url"] = _ZEP_BASE_URL
        if _ZEP_API_KEY:
            kwargs["api_key"] = _ZEP_API_KEY
        _client = AsyncZep(**kwargs)
        logger.info("Zep client initialised (base_url=%s)", _ZEP_BASE_URL or "cloud")
        return _client
    except ImportError as exc:
        logger.warning("zep-python not available: %s", exc)
        return None
    except Exception as exc:
        logger.error("Zep client init failed: %s", exc)
        return None


async def zep_add_messages(session_id: str, messages: list[dict]) -> None:
    """
    Append a list of {role, content} messages to a Zep session.
    The session is created automatically on first use.

    Zep will asynchronously extract entities, facts, and generate a rolling
    session summary — no extra work needed from the caller.
    """
    client = _get_client()
    if client is None:
        return
    try:
        zep_msgs = []
        for m in messages:
            role    = m.get("role", "user")
            content = m.get("content", "")
            if not content:
                continue
            # zep-python v2 Message as dict
            zep_msgs.append({
                "role":      role,
                "role_type": "user" if role == "user" else "assistant",
                "content":   content,
            })
        if zep_msgs:
            await client.memory.add(session_id, messages=zep_msgs)  # type: ignore[union-attr]
    except Exception as exc:
        logger.warning("Zep add_messages failed [%s]: %s", session_id, exc)


async def zep_search(session_id: str, query: str, limit: int = 3) -> list[str]:
    """
    Semantic search over the Zep session history.
    Returns a list of relevant message content strings.
    """
    client = _get_client()
    if client is None:
        return []
    try:
        results = await client.memory.search_sessions(  # type: ignore[union-attr]
            text=query,
            session_ids=[session_id],
            limit=limit,
        )
        return [
            r.message.content
            for r in (results or [])
            if getattr(r, "message", None) and r.message.content
        ]
    except Exception as exc:
        logger.warning("Zep search failed [%s]: %s", session_id, exc)
        return []


async def zep_get_summary(session_id: str) -> str:
    """
    Return Zep's auto-generated rolling summary for the session.
    Returns an empty string when unavailable.
    """
    client = _get_client()
    if client is None:
        return ""
    try:
        mem = await client.memory.get(session_id)  # type: ignore[union-attr]
        if mem and getattr(mem, "summary", None):
            return mem.summary.content or ""
        return ""
    except Exception as exc:
        logger.warning("Zep get_summary failed [%s]: %s", session_id, exc)
        return ""


async def zep_context(session_id: str, query: str, max_chars: int = 600) -> str:
    """
    Build a compact context string from Zep search results for LLM injection.
    """
    hits = await zep_search(session_id, query)
    if not hits:
        return ""
    block = "Relevant past conversation (from Zep memory):\n" + "\n".join(f"- {h}" for h in hits)
    return block[:max_chars]
