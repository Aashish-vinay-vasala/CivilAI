import asyncio
import logging
import time
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from pydantic import BaseModel, field_validator
from app.ai.copilot import get_copilot_response, analyze_project_data
from app.ai.chatbot_memory import get_history, add_message, clear_session
from app.ai.memory_mem0 import mem0_context, mem0_add
from app.core.guardrails import sanitize_prompt, validate_output
from app.core.llama_guard import check_input, check_output
from app.core.nemo_rails import check_message
from app.core.security import get_optional_user
from app.services.voice_db_service import build_module_context

_AUDIO_EXTS = {"mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4"}
_MAX_CONTENT_CHARS = 12_000

router = APIRouter()
logger = logging.getLogger("civilai.copilot")


class ChatMessage(BaseModel):
    message: str
    session_id: str = ""
    chat_history: list = []  # kept for backwards-compat; server-side history takes precedence

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v


class ChatResponse(BaseModel):
    response: str
    session_id: str = ""
    status: str = "success"
    warnings: list[str] = []


class CompareItem(BaseModel):
    name: str
    data: dict


class CompareRequest(BaseModel):
    context: str = "Risk Analysis"
    items: list[CompareItem]


@router.post("/chat", response_model=ChatResponse)
async def chat_with_copilot(
    request: Request,
    payload: ChatMessage,
    user: dict | None = Depends(get_optional_user),
):
    warnings: list[str] = []
    ip = request.client.host if request.client else "unknown"
    user_role = user.get("role", "anonymous") if user else "anonymous"
    session_id = payload.session_id.strip() or f"copilot_{int(time.time() * 1000)}"

    try:
        # ── Layer 1: regex sanitization + prompt injection ──────────────────
        clean_message, sanitize_warnings = sanitize_prompt(payload.message)
        warnings.extend(sanitize_warnings)

        # ── Layer 2: LlamaGuard — screen user input ─────────────────────────
        input_safe, input_violation = check_input(clean_message)
        if not input_safe:
            logger.warning(
                "LlamaGuard INPUT blocked | ip=%s | role=%s | violation=%s",
                ip, user_role, input_violation,
            )
            return ChatResponse(
                response=f"I'm unable to respond to that message. It was flagged for: {input_violation}. Please rephrase and try again.",
                session_id=session_id,
                status="input_blocked",
            )

        # ── Layer 3: Groq classifier — jailbreak + topical rails ────────────
        nemo_passed, nemo_refusal = await check_message(clean_message)
        if not nemo_passed:
            logger.warning(
                "Groq classifier blocked | ip=%s | role=%s | refusal=%.60s",
                ip, user_role, nemo_refusal,
            )
            return ChatResponse(response=nemo_refusal, session_id=session_id, status="guardrail_triggered")

        # ── Load persistent session history + mem0 long-term memory ─────────
        history = get_history(session_id)
        memory_ctx = await asyncio.to_thread(mem0_context, clean_message, session_id)

        effective_msg = clean_message
        if memory_ctx:
            effective_msg = f"{memory_ctx}\n\n{effective_msg}"

        # ── Fetch live project data from all relevant modules ─────────────────
        try:
            module_ctx = await asyncio.to_thread(build_module_context, clean_message)
        except Exception as _ctx_err:
            logger.debug("Module context fetch skipped: %s", _ctx_err)
            module_ctx = ""

        # ── Layer 4: main LLM call ───────────────────────────────────────────
        response = get_copilot_response(effective_msg, history, extra_context=module_ctx)

        # ── Layer 5: LlamaGuard — screen assistant output ───────────────────
        output_safe, output_violation = check_output(clean_message, response)
        if not output_safe:
            logger.warning(
                "LlamaGuard OUTPUT blocked | ip=%s | role=%s | violation=%s",
                ip, user_role, output_violation,
            )
            return ChatResponse(
                response="I generated a response that couldn't be delivered due to content policy. Please rephrase your question.",
                session_id=session_id,
                status="output_blocked",
                warnings=[f"Output blocked: {output_violation}"],
            )

        # ── Layer 6: output validation + safety disclaimer ───────────────────
        safe_response, _ = validate_output(response, context=clean_message)

        # ── Persist to Supabase session memory ───────────────────────────────
        add_message(session_id, "user", payload.message)
        add_message(session_id, "assistant", safe_response)

        # ── Store in mem0 long-term memory (fire-and-forget) ─────────────────
        asyncio.create_task(asyncio.to_thread(
            mem0_add,
            [{"role": "user", "content": payload.message}, {"role": "assistant", "content": safe_response}],
            session_id,
        ))

        return ChatResponse(response=safe_response, session_id=session_id, warnings=warnings)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "rate_limit_exceeded" in err_str:
            logger.warning("Copilot rate limited | ip=%s", ip)
            raise HTTPException(
                status_code=429,
                detail="AI service is temporarily rate-limited. Please wait a moment and try again.",
            )
        logger.error("Copilot error | ip=%s | error=%s", ip, e)
        raise HTTPException(status_code=500, detail=err_str)


@router.delete("/session/{session_id}")
async def clear_copilot_session(session_id: str):
    clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}


@router.get("/sessions/{session_id}/history")
async def get_copilot_history(session_id: str):
    history = get_history(session_id)
    return {"session_id": session_id, "messages": history, "count": len(history)}


@router.post("/upload", response_model=ChatResponse)
async def upload_and_chat(
    request: Request,
    file:       UploadFile = File(...),
    message:    str        = Form(default=""),
    session_id: str        = Form(default=""),
    user: dict | None = Depends(get_optional_user),
):
    """
    Upload a file and ask a question about it.

    Supported types:
      Documents  — PDF, DOCX, XLSX, CSV  (text/table extraction)
      Images     — PNG, JPG, JPEG, WEBP  (Gemini vision OCR)
      Audio      — MP3, WAV, WEBM, M4A, OGG, FLAC  (Whisper STT)

    Returns the same shape as /chat so the frontend can handle both identically.
    """
    warnings: list[str] = []
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
            logger.error("Audio transcription failed for %s: %s", filename, exc)
            raise HTTPException(400, f"Audio transcription failed: {exc}")
    else:
        try:
            from app.ocr.document_processor import process_document
            result = await asyncio.to_thread(process_document, file_bytes, filename)
            file_content = result.get("extracted_text", "")
            content_label = "File content"
        except Exception as exc:
            logger.error("File processing failed for %s: %s", filename, exc)
            raise HTTPException(400, f"Could not process file: {exc}")

        if not file_content.strip():
            raise HTTPException(400, "No readable content found in this file")

    if len(file_content) > _MAX_CONTENT_CHARS:
        file_content = file_content[:_MAX_CONTENT_CHARS]
        warnings.append(f"File content truncated to {_MAX_CONTENT_CHARS:,} characters")

    # ── Build combined message ────────────────────────────────────────────────
    user_question = message.strip() or "Please analyze and summarize this file."
    combined_msg = (
        f"[{content_label} from uploaded file: {filename}]\n\n"
        f"{file_content}\n\n"
        f"User question: {user_question}"
    )

    # ── Safety screen on question ─────────────────────────────────────────────
    try:
        clean_q, san_warns = sanitize_prompt(user_question)
        warnings.extend(san_warns)
    except ValueError:
        return ChatResponse(
            response="I can't respond to that question. Please rephrase it.",
            session_id=session_id or f"copilot_{int(time.time()*1000)}",
            status="input_blocked",
        )

    # ── Module context + session ──────────────────────────────────────────────
    try:
        module_ctx = await asyncio.to_thread(build_module_context, clean_q)
    except Exception:
        module_ctx = ""

    sid     = session_id.strip() or f"copilot_{int(time.time()*1000)}"
    history = get_history(sid)

    # ── LLM ───────────────────────────────────────────────────────────────────
    try:
        raw_response = get_copilot_response(combined_msg, history, extra_context=module_ctx)
    except Exception as exc:
        logger.error("Copilot upload LLM error | ip=%s | file=%s | error=%s", ip, filename, exc)
        raise HTTPException(500, f"LLM error: {exc}")

    safe_response, _ = validate_output(raw_response, context=combined_msg)

    # ── Persist ───────────────────────────────────────────────────────────────
    display_user = f"📎 {filename}\n{user_question}"
    add_message(sid, "user",      display_user)
    add_message(sid, "assistant", safe_response)

    asyncio.create_task(asyncio.to_thread(
        mem0_add,
        [{"role": "user", "content": display_user}, {"role": "assistant", "content": safe_response}],
        sid,
    ))

    return ChatResponse(response=safe_response, session_id=sid, status="success", warnings=warnings)


@router.post("/compare", response_model=ChatResponse)
async def compare_items(request: Request, payload: CompareRequest):
    """Real LLM-generated comparison narrative across 2+ items (projects, GNN runs, etc.)
    supplied as structured data — not free-form user text, so this skips the chat
    guardrail/session pipeline and calls the model directly."""
    ip = request.client.host if request.client else "unknown"
    if len(payload.items) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 items to compare")

    comparison_data = {item.name: item.data for item in payload.items}
    question = (
        f"Compare these {len(payload.items)} {payload.context} results side by side. "
        "Identify the biggest differences between them, state clearly which is highest-risk and why, "
        "and give 2-3 concrete, prioritized recommendations based on the comparison."
    )

    try:
        raw_response = analyze_project_data(comparison_data, question)
    except RuntimeError as exc:
        logger.error("Compare error | ip=%s | error=%s", ip, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    safe_response, _ = validate_output(raw_response, context=question)
    return ChatResponse(response=safe_response, status="success")


@router.get("/health")
async def copilot_health():
    return {"status": "CivilAI Copilot Ready"}
