"""
Supabase-backed conversation memory for multi-channel chatbot.

Each conversation is identified by a session_id string. The session_id
convention by channel:
  web        web_<timestamp_ms>    (generated client-side, stored in localStorage)
  whatsapp   wa_<E164_number>      (e.g. wa_12025551234)
  slack      slack_<user>_<chan>

Required Supabase table (run once in the SQL Editor):

  CREATE TABLE chatbot_sessions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    channel     TEXT DEFAULT 'web',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_chatbot_sessions_sid
    ON chatbot_sessions(session_id, created_at DESC);
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from app.services.db_service import supabase
from app.core.guardrails import redact_pii

logger   = logging.getLogger("civilai.chatbot_memory")
_TABLE   = "chatbot_sessions"
_MAX_MSG = 20   # messages kept per session (older ones ignored)


def get_history(session_id: str) -> list[dict]:
    """
    Return the last _MAX_MSG messages for a session as [{role, content}] in
    chronological order, ready to pass as `chat_history` to the LLM.
    """
    if not session_id:
        return []
    try:
        res = (
            supabase.table(_TABLE)
            .select("role,content,created_at")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .limit(_MAX_MSG)
            .execute()
        )
        msgs = list(reversed(res.data or []))
        return [{"role": m["role"], "content": m["content"]} for m in msgs]
    except Exception as exc:
        logger.warning("Memory fetch failed [%s]: %s", session_id, exc)
        return []


def add_message(
    session_id: str,
    role: str,
    content: str,
    channel: str = "web",
    metadata: Optional[dict] = None,
) -> None:
    """Append one message to the session log. Content is PII-redacted before
    persisting — this only affects the stored copy, not the current turn's
    LLM context, which already received the raw text."""
    if not session_id:
        return
    try:
        supabase.table(_TABLE).insert({
            "session_id": session_id,
            "role":       role,
            "content":    redact_pii(content),
            "channel":    channel,
            "metadata":   metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning("Memory write failed [%s]: %s", session_id, exc)


def clear_session(session_id: str) -> None:
    """Delete all messages for a session (new conversation)."""
    if not session_id:
        return
    try:
        supabase.table(_TABLE).delete().eq("session_id", session_id).execute()
    except Exception as exc:
        logger.warning("Memory clear failed [%s]: %s", session_id, exc)


def session_context_text(session_id: str, max_chars: int = 2000) -> str:
    """Return the conversation history as a single readable string."""
    history = get_history(session_id)
    if not history:
        return ""
    lines: list[str] = []
    for msg in history:
        prefix = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"{prefix}: {msg['content'][:400]}")
    return "\n".join(lines)[:max_chars]
