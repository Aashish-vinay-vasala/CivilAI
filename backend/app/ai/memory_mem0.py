"""
mem0 long-term memory layer for CivilAI.

Unlike the session-based Supabase memory (chatbot_memory.py), mem0 extracts
structured facts from conversations and retrieves them semantically — allowing
the assistant to remember user preferences, project names, past decisions, and
constraints indefinitely across sessions.

Two modes (selected automatically):
  Cloud  — set MEM0_API_KEY for mem0's managed cloud (free tier available)
  Local  — omit MEM0_API_KEY; uses Groq + HuggingFace embeddings + Chroma locally

Required packages (all free / open-source):
  mem0ai

Required env vars:
  GROQ_API_KEY       (shared with existing analyzers)

Optional env vars:
  MEM0_API_KEY       Use mem0 cloud (free tier) instead of local mode
  MEM0_EMBED_MODEL   HuggingFace embedding model (default: BAAI/bge-small-en-v1.5)
  MEM0_CHROMA_PATH   Local Chroma path for local mode (default: ./data/mem0_chroma)
"""
import logging
import os
from typing import Optional

logger = logging.getLogger("civilai.mem0")

_MEM0_API_KEY   = os.getenv("MEM0_API_KEY",   "")
_GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")
_EMBED_MODEL    = os.getenv("MEM0_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
_CHROMA_PATH    = os.getenv("MEM0_CHROMA_PATH", "./data/mem0_chroma")
_GROQ_LLM_MODEL = "llama-3.3-70b-versatile"

_mem: Optional[object] = None


def _get_mem() -> Optional[object]:
    global _mem
    if _mem is not None:
        return _mem
    try:
        if _MEM0_API_KEY:
            from mem0 import MemoryClient  # type: ignore[import-untyped]
            _mem = MemoryClient(api_key=_MEM0_API_KEY)
            logger.info("mem0: using cloud mode")
        else:
            from mem0 import Memory  # type: ignore[import-untyped]
            config = {
                "llm": {
                    "provider": "groq",
                    "config": {
                        "model":   _GROQ_LLM_MODEL,
                        "api_key": _GROQ_API_KEY,
                    },
                },
                "embedder": {
                    "provider": "huggingface",
                    "config":   {"model": _EMBED_MODEL},
                },
                "vector_store": {
                    "provider": "chroma",
                    "config": {
                        "collection_name": "civilai_mem0",
                        "path":            _CHROMA_PATH,
                    },
                },
            }
            _mem = Memory.from_config(config)
            logger.info("mem0: using local mode (Groq + HuggingFace + Chroma)")
        return _mem
    except ImportError as exc:
        logger.warning("mem0ai not available: %s", exc)
        return None
    except Exception as exc:
        logger.error("mem0 init failed: %s", exc)
        return None


def mem0_add(messages: list[dict], user_id: str) -> None:
    """
    Store a conversation turn (list of {role, content}) as long-term memories.

    mem0 automatically extracts facts from the messages and stores them as
    semantic memories linked to user_id.
    """
    m = _get_mem()
    if m is None:
        return
    try:
        m.add(messages, user_id=user_id)  # type: ignore[union-attr]
    except Exception as exc:
        logger.warning("mem0 add failed [%s]: %s", user_id, exc)


def mem0_search(query: str, user_id: str, limit: int = 5) -> list[str]:
    """
    Retrieve the most relevant long-term memories for a user given a query.
    Returns a list of memory strings, or [] when unavailable.
    """
    m = _get_mem()
    if m is None:
        return []
    try:
        results = m.search(query, filters={"user_id": user_id}, top_k=limit)  # type: ignore[union-attr]
        if isinstance(results, dict):
            results = results.get("results", [])
        return [r.get("memory", "") for r in (results or []) if r.get("memory")]
    except Exception as exc:
        logger.warning("mem0 search failed [%s]: %s", user_id, exc)
        return []


def mem0_get_all(user_id: str) -> list[str]:
    """Return all stored memories for a user (no query)."""
    m = _get_mem()
    if m is None:
        return []
    try:
        results = m.get_all(filters={"user_id": user_id})  # type: ignore[union-attr]
        if isinstance(results, dict):
            results = results.get("results", [])
        return [r.get("memory", "") for r in (results or []) if r.get("memory")]
    except Exception as exc:
        logger.warning("mem0 get_all failed [%s]: %s", user_id, exc)
        return []


def mem0_context(query: str, user_id: str, max_chars: int = 800) -> str:
    """
    Build a formatted string of relevant memories for LLM context injection.
    Returns an empty string when no memories exist or mem0 is unavailable.
    """
    memories = mem0_search(query, user_id)
    if not memories:
        return ""
    lines = [f"- {m}" for m in memories]
    block = "Relevant long-term memories about this user:\n" + "\n".join(lines)
    return block[:max_chars]


def mem0_delete_user(user_id: str) -> None:
    """Remove all memories for a user (GDPR / right-to-erasure support)."""
    m = _get_mem()
    if m is None:
        return
    try:
        m.delete_all(user_id=user_id)  # type: ignore[union-attr]
    except Exception as exc:
        logger.warning("mem0 delete_all failed [%s]: %s", user_id, exc)
