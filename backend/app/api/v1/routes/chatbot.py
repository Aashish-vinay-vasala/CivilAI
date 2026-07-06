"""
Chatbot routes with persistent memory (Supabase) + mem0 long-term memory.

  POST /chat               — embedded widget (JSON ↔ JSON, session memory)
  DELETE /session/{sid}    — clear a chat session
  GET  /sessions/{sid}/history — retrieve session history
  GET  /health             — liveness

Supabase table required: chatbot_sessions (see chatbot_memory.py docstring)
"""
import asyncio
import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.ai.copilot import get_copilot_response
from app.ai.chatbot_memory import get_history, add_message, clear_session
from app.ai.memory_mem0 import mem0_context, mem0_add
from app.ai.memory_zep import zep_context, zep_add_messages
from app.core.guardrails import sanitize_prompt, validate_output
from app.core.llama_guard import check_input
from app.services.voice_db_service import build_module_context

router = APIRouter()
logger = logging.getLogger("civilai.chatbot")


# ── Models ─────────────────────────────────────────────────────────────────────

class WidgetMessage(BaseModel):
    message:    str
    session_id: str = ""
    channel:    str = "web"
    context:    str = ""   # optional page context hint

    @field_validator("message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message cannot be empty")
        return v.strip()


class WidgetResponse(BaseModel):
    reply:      str
    session_id: str
    status:     str = "success"


# ── Embedded widget ────────────────────────────────────────────────────────────

@router.post("/chat", response_model=WidgetResponse)
async def widget_chat(body: WidgetMessage):
    """
    Embedded chat widget endpoint with persistent session memory + mem0 long-term memory.
    Pass an existing session_id to continue a conversation; omit to start a new one.
    The returned session_id must be persisted client-side (localStorage).
    """
    session_id = body.session_id.strip() or f"web_{int(time.time() * 1000)}"
    history    = get_history(session_id)

    # Pull relevant long-term memories (non-blocking thread call)
    memory_ctx = await asyncio.to_thread(mem0_context, body.message, session_id)
    zep_ctx = await zep_context(session_id, body.message)
    combined_ctx = "\n\n".join(c for c in (memory_ctx, zep_ctx) if c)

    effective_msg = body.message
    if body.context:
        effective_msg = f"[Context: {body.context}] {effective_msg}"
    if combined_ctx:
        effective_msg = f"{combined_ctx}\n\n{effective_msg}"

    # Fetch live project data from all relevant modules
    try:
        module_ctx = await asyncio.to_thread(build_module_context, body.message)
    except Exception as _ctx_err:
        logger.debug("Module context fetch skipped: %s", _ctx_err)
        module_ctx = ""

    try:
        clean, _ = sanitize_prompt(body.message)
    except ValueError:
        clean = body.message
    except Exception:
        clean = body.message

    try:
        raw   = get_copilot_response(effective_msg, history, extra_context=module_ctx)
        reply, _ = validate_output(raw, context=clean)
    except Exception as exc:
        logger.error("Widget chat error: %s", exc)
        raise HTTPException(500, f"Chat error: {exc}")

    add_message(session_id, "user",      body.message, channel=body.channel)
    add_message(session_id, "assistant", reply,        channel=body.channel)

    # Store this turn in long-term memory (fire-and-forget — doesn't delay response)
    turn_messages = [{"role": "user", "content": body.message}, {"role": "assistant", "content": reply}]
    asyncio.create_task(asyncio.to_thread(mem0_add, turn_messages, session_id))
    asyncio.create_task(zep_add_messages(session_id, turn_messages))

    return WidgetResponse(reply=reply, session_id=session_id)


@router.delete("/session/{session_id}")
async def clear_chat_session(session_id: str):
    """Clear all messages for a session (start fresh)."""
    clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str):
    """Retrieve conversation history for a session."""
    history = get_history(session_id)
    return {"session_id": session_id, "messages": history, "count": len(history)}


# ── Health ─────────────────────────────────────────────────────────────────────

@router.get("/health")
async def chatbot_health():
    return {
        "status":   "Chatbot API ready",
        "channels": ["web_widget"],
        "memory":   "Supabase chatbot_sessions",
    }
