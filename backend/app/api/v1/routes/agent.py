"""
Agent routes — LangGraph ReAct agent with domain tools.

  POST /chat       — single-shot agent run, returns reply + tool_steps list
  POST /stream     — SSE stream of tokens + tool events
  POST /classify   — dialogue intent classification only (lightweight)
  POST /upload     — file upload + agent analysis
  GET  /sessions   — list saved agent sessions from Supabase
  DELETE /sessions/{session_id} — delete a session
  GET  /health
"""
import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.ai.agent_copilot import run_agent, run_agent_stream
from app.ai.dialogue_manager import classify_dialogue
from app.ai.chatbot_memory import get_history, add_message
from app.core.guardrails import sanitize_prompt, validate_output
from app.core.llama_guard import check_input, check_output
from app.core.nemo_rails import check_message

_AUDIO_EXTS = {"mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4"}
_MAX_CONTENT_CHARS = 12_000

router = APIRouter()
logger = logging.getLogger("civilai.agent")


# ── Models ─────────────────────────────────────────────────────────────────────

class AgentMessage(BaseModel):
    message:    str
    session_id: str = ""
    project_id: str = ""

    @field_validator("message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message cannot be empty")
        return v.strip()


class ToolStep(BaseModel):
    tool:   str
    input:  dict
    output: Optional[str] = None


class AgentResponse(BaseModel):
    reply:      str
    session_id: str
    tool_steps: list[ToolStep] = []
    intent:     Optional[str] = None
    status:     str = "success"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=AgentResponse)
async def agent_chat(request: Request, body: AgentMessage):
    """
    Run the LangGraph agent for one turn. Returns the full reply plus every tool call
    the agent made (tool name, input args, output summary) for display in the UI.

    Runs the same guardrail chain as /api/v1/copilot/chat (sanitize -> LlamaGuard
    input -> jailbreak classifier -> agent -> LlamaGuard output -> validate) since
    this route reaches the same write-capable tools.
    """
    ip = request.client.host if request.client else "unknown"
    session_id = body.session_id.strip() or f"agent_{int(time.time() * 1000)}"

    try:
        clean_message, _warnings = sanitize_prompt(body.message)
    except ValueError as e:
        return AgentResponse(reply=str(e), session_id=session_id, status="input_blocked")

    input_safe, input_violation = check_input(clean_message)
    if not input_safe:
        logger.warning("Agent LlamaGuard INPUT blocked | ip=%s | violation=%s", ip, input_violation)
        return AgentResponse(
            reply=f"I'm unable to respond to that message. It was flagged for: {input_violation}. Please rephrase and try again.",
            session_id=session_id,
            status="input_blocked",
        )

    nemo_passed, nemo_refusal = await check_message(clean_message)
    if not nemo_passed:
        logger.warning("Agent jailbreak classifier blocked | ip=%s | refusal=%.60s", ip, nemo_refusal)
        return AgentResponse(reply=nemo_refusal, session_id=session_id, status="guardrail_triggered")

    history = get_history(session_id)

    # Prepend project_id context so the agent knows which project to query
    agent_message = clean_message
    if body.project_id.strip():
        agent_message = f"[project_id: {body.project_id.strip()}]\n{clean_message}"

    # Classify intent for the response metadata
    dialogue = classify_dialogue(clean_message, history[-4:] if history else [])

    try:
        result = run_agent(agent_message, history)
    except Exception as exc:
        logger.error("Agent error: %s", exc)
        raise HTTPException(500, f"Agent error: {exc}")

    reply = result["reply"]
    steps = [ToolStep(**s) for s in result["tool_steps"]]

    output_safe, output_violation = check_output(clean_message, reply)
    if not output_safe:
        logger.warning("Agent LlamaGuard OUTPUT blocked | ip=%s | violation=%s", ip, output_violation)
        return AgentResponse(
            reply="I generated a response that couldn't be delivered due to content policy. Please rephrase your question.",
            session_id=session_id,
            status="output_blocked",
        )

    safe_reply, _ = validate_output(reply, context=clean_message)

    add_message(session_id, "user",      body.message, channel="agent")
    add_message(session_id, "assistant", safe_reply,   channel="agent")

    return AgentResponse(
        reply=safe_reply,
        session_id=session_id,
        tool_steps=steps,
        intent=dialogue.intent,
    )


@router.post("/stream")
async def agent_stream(request: Request, body: AgentMessage):
    """
    Server-Sent Events stream of the agent's reasoning.

    Event shapes (newline-delimited JSON after 'data: '):
      {"type": "intent",      "intent": "...", "requires_data": bool}
      {"type": "token",       "content": "..."}
      {"type": "tool_start",  "tool": "...", "input": {...}}
      {"type": "tool_end",    "tool": "...", "output": "..."}
      {"type": "done"}
      {"type": "error",       "content": "..."}
      {"type": "blocked",     "content": "...", "status": "..."}  — guardrail refusal

    Runs the same pre/post guardrail chain as /chat, adapted for streaming: input
    checks run before the stream starts, output LlamaGuard runs on the fully
    assembled text once streaming finishes.
    """
    ip = request.client.host if request.client else "unknown"
    session_id = body.session_id.strip() or f"agent_{int(time.time() * 1000)}"

    async def blocked_stream(msg: str, status: str = "input_blocked"):
        yield f"data: {json.dumps({'type': 'blocked', 'content': msg, 'status': status, 'session_id': session_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    try:
        clean_message, _warnings = sanitize_prompt(body.message)
    except ValueError as e:
        return StreamingResponse(blocked_stream(str(e)), media_type="text/event-stream")

    input_safe, input_violation = check_input(clean_message)
    if not input_safe:
        logger.warning("Agent stream LlamaGuard INPUT blocked | ip=%s | violation=%s", ip, input_violation)
        return StreamingResponse(
            blocked_stream(f"I'm unable to respond to that message. It was flagged for: {input_violation}. Please rephrase and try again."),
            media_type="text/event-stream",
        )

    nemo_passed, nemo_refusal = await check_message(clean_message)
    if not nemo_passed:
        logger.warning("Agent stream jailbreak classifier blocked | ip=%s | refusal=%.60s", ip, nemo_refusal)
        return StreamingResponse(
            blocked_stream(nemo_refusal, status="guardrail_triggered"), media_type="text/event-stream",
        )

    history    = get_history(session_id)
    dialogue   = classify_dialogue(clean_message, history[-4:] if history else [])

    # Inject project_id into message so tools know which project to query
    agent_message = clean_message
    if body.project_id.strip():
        agent_message = f"[project_id: {body.project_id.strip()}]\n{clean_message}"

    full_reply_parts: list[str] = []

    async def generate():
        # First event: intent classification with confidence + urgency
        yield f"data: {json.dumps({'type': 'intent', 'intent': dialogue.intent, 'confidence': dialogue.confidence, 'urgency': dialogue.urgency, 'requires_data': dialogue.requires_data, 'session_id': session_id})}\n\n"

        tool_steps_for_session: list[dict] = []

        async for event in run_agent_stream(agent_message, history):
            if event["type"] == "token":
                full_reply_parts.append(event["content"])
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "tool_end":
                tool_steps_for_session.append({
                    "tool":   event.get("tool", ""),
                    "output": event.get("output", "")[:500],
                })
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                continue  # our own "done" (after the output safety check) replaces this
            else:
                yield f"data: {json.dumps(event)}\n\n"

        # ── Output safety screen on the fully-assembled text ─────────────────
        final_reply = "".join(full_reply_parts)
        output_safe, output_violation = check_output(clean_message, final_reply) if final_reply else (True, "")
        if not output_safe:
            logger.warning("Agent stream LlamaGuard OUTPUT blocked | ip=%s | violation=%s", ip, output_violation)
            yield f"data: {json.dumps({'type': 'token', 'content': 'I generated a response that could not be delivered due to content policy. Please rephrase your question.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        safe_reply, _ = validate_output(final_reply, context=clean_message) if final_reply else ("", True)
        # Tokens already reached the client live, so only an *appended* disclaimer
        # (not a truncation, which shortens the text) can be sent as a trailing delta.
        if safe_reply.startswith(final_reply) and len(safe_reply) > len(final_reply):
            yield f"data: {json.dumps({'type': 'token', 'content': safe_reply[len(final_reply):]})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Persist to memory and Supabase after streaming completes
        if safe_reply:
            add_message(session_id, "user",      body.message, channel="agent")
            add_message(session_id, "assistant", safe_reply,   channel="agent")

            try:
                from app.config import settings
                from supabase import create_client
                _sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
                _sb.table("agent_sessions").upsert({
                    "session_id":  session_id,
                    "last_message": body.message[:500],
                    "last_reply":   safe_reply[:1000],
                    "intent":       dialogue.intent,
                    "tool_steps":   tool_steps_for_session,
                    "updated_at":   "now()",
                }, on_conflict="session_id").execute()
            except Exception as _sb_err:
                logger.debug("Session upsert skipped: %s", _sb_err)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/classify")
async def classify_intent(body: AgentMessage):
    """Lightweight intent classification without running the full agent."""
    history  = get_history(body.session_id) if body.session_id else []
    dialogue = classify_dialogue(body.message, history[-4:] if history else [])
    return {
        "intent":         dialogue.intent,
        "confidence":     dialogue.confidence,
        "requires_data":  dialogue.requires_data,
        "suggested_tool": dialogue.suggested_tool,
        "urgency":        dialogue.urgency,
        "follow_up":      dialogue.follow_up,
        "entities":       dialogue.entities.model_dump(exclude_none=True),
    }


@router.post("/upload", response_model=AgentResponse)
async def agent_upload(
    request:    Request,
    file:       UploadFile = File(...),
    message:    str        = Form(default=""),
    session_id: str        = Form(default=""),
):
    """
    Upload a file (PDF, image, audio, or document) and run the agent against its content.

    The agent will pick the most relevant tool(s) automatically:
      - PDF schedule → analyze_schedule_data
      - Safety report image → analyze_safety_data
      - Audio meeting recording → transcribed then analyzed
      - Contract PDF → analyze_contract_data
      etc.
    """
    ip = request.client.host if request.client else "unknown"
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "Empty file")
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (25 MB limit)")

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # ── Extract content ───────────────────────────────────────────────────────
    if ext in _AUDIO_EXTS:
        try:
            from app.ai.voice_processor import transcribe_audio
            file_content = await asyncio.to_thread(transcribe_audio, file_bytes, filename)
            content_label = "Audio transcript"
        except Exception as exc:
            raise HTTPException(400, f"Audio transcription failed: {exc}")
    else:
        try:
            from app.ocr.document_processor import process_document
            result = await asyncio.to_thread(process_document, file_bytes, filename)
            file_content = result.get("extracted_text", "")
            content_label = "File content"
        except Exception as exc:
            raise HTTPException(400, f"Could not process file: {exc}")

        if not file_content.strip():
            raise HTTPException(400, "No readable content found in this file")

    if len(file_content) > _MAX_CONTENT_CHARS:
        file_content = file_content[:_MAX_CONTENT_CHARS]

    # ── Build agent message ───────────────────────────────────────────────────
    raw_question = message.strip() or "Analyze this file and provide a detailed assessment."
    sid = session_id.strip() or f"agent_{int(time.time()*1000)}"

    try:
        user_question, _warnings = sanitize_prompt(raw_question)
    except ValueError as e:
        return AgentResponse(reply=str(e), session_id=sid, status="input_blocked")

    input_safe, input_violation = check_input(user_question)
    if not input_safe:
        logger.warning("Agent upload LlamaGuard INPUT blocked | ip=%s | violation=%s", ip, input_violation)
        return AgentResponse(
            reply=f"I'm unable to respond to that question. It was flagged for: {input_violation}. Please rephrase and try again.",
            session_id=sid,
            status="input_blocked",
        )

    agent_msg = (
        f"[{content_label} from: {filename}]\n\n"
        f"{file_content}\n\n"
        f"{user_question}"
    )

    history = get_history(sid)
    dialogue = classify_dialogue(user_question, history[-4:] if history else [])

    try:
        result = await asyncio.to_thread(run_agent, agent_msg, history)
    except Exception as exc:
        logger.error("Agent upload error: %s", exc)
        raise HTTPException(500, f"Agent error: {exc}")

    reply = result["reply"]
    steps = [ToolStep(**s) for s in result["tool_steps"]]

    output_safe, output_violation = check_output(user_question, reply)
    if not output_safe:
        logger.warning("Agent upload LlamaGuard OUTPUT blocked | ip=%s | violation=%s", ip, output_violation)
        return AgentResponse(
            reply="I generated a response that couldn't be delivered due to content policy. Please rephrase your question.",
            session_id=sid,
            status="output_blocked",
        )

    safe_reply, _ = validate_output(reply, context=user_question)

    display_user = f"📎 {filename}\n{user_question}"
    add_message(sid, "user",      display_user, channel="agent")
    add_message(sid, "assistant", safe_reply,   channel="agent")

    return AgentResponse(
        reply=safe_reply,
        session_id=sid,
        tool_steps=steps,
        intent=dialogue.intent,
    )


@router.get("/sessions")
async def list_sessions(limit: int = 20):
    """Return saved agent sessions from Supabase (most recent first)."""
    try:
        from app.config import settings
        from supabase import create_client
        _sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
        res = (
            _sb.table("agent_sessions")
            .select("session_id, last_message, last_reply, intent, tool_steps, updated_at")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"sessions": res.data or []}
    except Exception as exc:
        logger.warning("Could not fetch agent sessions: %s", exc)
        return {"sessions": []}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete an agent session from Supabase and in-memory history."""
    try:
        from app.config import settings
        from supabase import create_client
        _sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
        _sb.table("agent_sessions").delete().eq("session_id", session_id).execute()
    except Exception as exc:
        logger.warning("Supabase delete failed: %s", exc)

    try:
        from app.ai.chatbot_memory import clear_history
        clear_history(session_id)
    except Exception:
        pass

    return {"success": True, "session_id": session_id}


@router.get("/health")
async def agent_health():
    return {
        "status":  "Agent API ready",
        "model":   "llama-3.3-70b-versatile (LangGraph ReAct)",
        "tools":   [
            "analyze_schedule_data", "analyze_safety_data", "analyze_cost_data",
            "analyze_contract_data", "calculate_evm_metrics", "assess_compliance_data",
            "analyze_equipment_data", "generate_document",
            "analyze_vendor_data", "analyze_payment_data", "analyze_workforce_data",
            "analyze_procurement_data", "assess_green_metrics", "analyze_bim_data",
            "run_what_if_scenario", "generate_advanced_report",
        ],
        "streaming": True,
        "file_upload": True,
        "session_persistence": True,
    }
