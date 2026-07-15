import asyncio
import json
import logging
import time
import uuid
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, field_validator
from app.ai.copilot import get_copilot_response, get_copilot_response_stream
from app.ai.chatbot_memory import get_history, add_message, clear_session
from app.ai.memory_mem0 import mem0_context, mem0_add
from app.ai.memory_zep import zep_context, zep_add_messages
from app.ai.pydantic_agent import pydantic_chat
from app.core.guardrails import sanitize_prompt, validate_output
from app.core.llama_guard import check_input, check_output
from app.core.nemo_rails import check_message
from app.core.security import get_optional_user
from app.services.voice_db_service import build_module_context
from app.services.web_search_service import search_web, build_search_query, filter_cited_sources
from app.services import usage_tracker
from app.ai.groq_client import get_key_pool_size

_AUDIO_EXTS = {"mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4"}
_MAX_CONTENT_CHARS = 12_000

router = APIRouter()
logger = logging.getLogger("civilai.copilot")


class ChatMessage(BaseModel):
    message: str
    session_id: str = ""
    chat_history: list = []  # kept for backwards-compat; server-side history takes precedence
    web_search: bool = False  # when true, augments the answer with live DuckDuckGo results

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v


class Source(BaseModel):
    title: str
    url: str


class ChatResponse(BaseModel):
    response: str
    session_id: str = ""
    status: str = "success"
    warnings: list[str] = []
    sources: list[Source] = []


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

        # ── Load persistent session history + mem0/Zep long-term memory ─────
        history = get_history(session_id)
        memory_ctx = await asyncio.to_thread(mem0_context, clean_message, session_id)
        zep_ctx = await zep_context(session_id, clean_message)

        effective_msg = clean_message
        combined_ctx = "\n\n".join(c for c in (memory_ctx, zep_ctx) if c)
        if combined_ctx:
            effective_msg = f"{combined_ctx}\n\n{effective_msg}"

        # ── Fetch live project data from all relevant modules ─────────────────
        try:
            module_ctx = await asyncio.to_thread(build_module_context, clean_message)
        except Exception as _ctx_err:
            logger.debug("Module context fetch skipped: %s", _ctx_err)
            module_ctx = ""

        # ── Optional live web search ─────────────────────────────────────────
        web_results: list[dict] = []
        web_ctx = ""
        if payload.web_search:
            search_query = build_search_query(clean_message)
            try:
                web_results = await asyncio.to_thread(search_web, search_query)
            except Exception as _web_err:
                logger.debug("Web search skipped: %s", _web_err)
                web_results = []
            if web_results:
                web_ctx = "\n".join(
                    f"{i + 1}. {r['title']} — {r['snippet']}\n   URL: {r['url']}"
                    for i, r in enumerate(web_results)
                )

        # ── Layer 4: main LLM call ───────────────────────────────────────────
        response = get_copilot_response(effective_msg, history, extra_context=module_ctx, web_context=web_ctx)

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

        # ── Store in mem0 + Zep long-term memory (fire-and-forget) ───────────
        turn_messages = [{"role": "user", "content": payload.message}, {"role": "assistant", "content": safe_response}]
        asyncio.create_task(asyncio.to_thread(mem0_add, turn_messages, session_id))
        asyncio.create_task(zep_add_messages(session_id, turn_messages))

        sources = filter_cited_sources(safe_response, web_results)
        return ChatResponse(response=safe_response, session_id=session_id, warnings=warnings, sources=sources)

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


def _ndjson(obj: dict) -> str:
    return json.dumps(obj) + "\n"


@router.post("/chat/stream")
async def chat_with_copilot_stream(
    request: Request,
    payload: ChatMessage,
    user: dict | None = Depends(get_optional_user),
):
    """
    Same guardrail pipeline and behaviour as /chat, but streams the answer as
    newline-delimited JSON so the widget can render it token-by-token:

      {"delta": "..."}                                    — one per chunk of text
      {"done": true, "blocked": true,  "response": "..."} — refused/blocked, nothing was streamed
      {"done": true, "blocked": false, "final": "...", "session_id": "...", "sources": [...]}

    Output safety (LlamaGuard) still runs on the FULL assembled text after
    streaming finishes — if it fails, the client is told to replace whatever
    was streamed with the safe refusal message (see "blocked" on the done event).
    """
    ip = request.client.host if request.client else "unknown"
    user_role = user.get("role", "anonymous") if user else "anonymous"
    session_id = payload.session_id.strip() or f"copilot_{int(time.time() * 1000)}"

    async def blocked(msg: str, status: str = "input_blocked"):
        yield _ndjson({"done": True, "blocked": True, "response": msg, "session_id": session_id, "status": status})

    # ── Layers 1–3: same pre-LLM guardrails as /chat ────────────────────────────
    try:
        clean_message, _sanitize_warnings = sanitize_prompt(payload.message)
    except ValueError as e:
        return StreamingResponse(blocked(str(e)), media_type="application/x-ndjson")

    input_safe, input_violation = check_input(clean_message)
    if not input_safe:
        logger.warning("LlamaGuard INPUT blocked | ip=%s | role=%s | violation=%s", ip, user_role, input_violation)
        return StreamingResponse(
            blocked(f"I'm unable to respond to that message. It was flagged for: {input_violation}. Please rephrase and try again."),
            media_type="application/x-ndjson",
        )

    nemo_passed, nemo_refusal = await check_message(clean_message)
    if not nemo_passed:
        logger.warning("Groq classifier blocked | ip=%s | role=%s | refusal=%.60s", ip, user_role, nemo_refusal)
        return StreamingResponse(blocked(nemo_refusal, status="guardrail_triggered"), media_type="application/x-ndjson")

    history = get_history(session_id)
    memory_ctx = await asyncio.to_thread(mem0_context, clean_message, session_id)
    zep_ctx = await zep_context(session_id, clean_message)
    effective_msg = clean_message
    combined_ctx = "\n\n".join(c for c in (memory_ctx, zep_ctx) if c)
    if combined_ctx:
        effective_msg = f"{combined_ctx}\n\n{effective_msg}"

    try:
        module_ctx = await asyncio.to_thread(build_module_context, clean_message)
    except Exception:
        module_ctx = ""

    web_results: list[dict] = []
    web_ctx = ""
    if payload.web_search:
        search_query = build_search_query(clean_message)
        try:
            web_results = await asyncio.to_thread(search_web, search_query)
        except Exception:
            web_results = []
        if web_results:
            web_ctx = "\n".join(
                f"{i + 1}. {r['title']} — {r['snippet']}\n   URL: {r['url']}"
                for i, r in enumerate(web_results)
            )

    async def event_stream():
        full_text = ""
        try:
            for delta in get_copilot_response_stream(effective_msg, history, extra_context=module_ctx, web_context=web_ctx):
                full_text += delta
                yield _ndjson({"delta": delta})
        except Exception as exc:
            err_str = str(exc)
            if "429" in err_str or "rate_limit_exceeded" in err_str or "temporarily unavailable" in err_str:
                yield _ndjson({"done": True, "blocked": True, "response": "AI service is temporarily unavailable. Please try again shortly."})
            else:
                logger.error("Copilot stream error | ip=%s | error=%s", ip, exc)
                yield _ndjson({"done": True, "blocked": True, "response": "Something went wrong generating a response. Please try again."})
            return

        if not full_text.strip():
            yield _ndjson({"done": True, "blocked": True, "response": "I wasn't able to generate a response. Please try again."})
            return

        # ── Output safety screen — runs on the fully-assembled text ─────────────
        output_safe, output_violation = check_output(clean_message, full_text)
        if not output_safe:
            logger.warning("LlamaGuard OUTPUT blocked | ip=%s | role=%s | violation=%s", ip, user_role, output_violation)
            yield _ndjson({
                "done": True, "blocked": True,
                "response": "I generated a response that couldn't be delivered due to content policy. Please rephrase your question.",
            })
            return

        safe_response, _ = validate_output(full_text, context=clean_message)

        add_message(session_id, "user", payload.message)
        add_message(session_id, "assistant", safe_response)
        turn_messages = [{"role": "user", "content": payload.message}, {"role": "assistant", "content": safe_response}]
        asyncio.create_task(asyncio.to_thread(mem0_add, turn_messages, session_id))
        asyncio.create_task(zep_add_messages(session_id, turn_messages))

        sources = filter_cited_sources(safe_response, web_results)
        yield _ndjson({
            "done": True, "blocked": False,
            "final": safe_response,
            "session_id": session_id,
            "sources": sources,
        })

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.post("/structured")
async def structured_chat(payload: ChatMessage):
    """
    PydanticAI-backed alternative to /chat — returns a structured answer
    (confidence score, construction domain, optional follow-up question)
    instead of free text. Useful for UI affordances that need machine-readable
    fields rather than parsing a text blob.
    """
    try:
        clean_message, _ = sanitize_prompt(payload.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    input_safe, input_violation = check_input(clean_message)
    if not input_safe:
        raise HTTPException(status_code=400, detail=f"Message flagged for: {input_violation}")

    session_id = payload.session_id.strip() or f"copilot_{int(time.time() * 1000)}"
    history = get_history(session_id)

    result = await pydantic_chat(clean_message, history)

    add_message(session_id, "user", payload.message)
    add_message(session_id, "assistant", result.answer)

    return {"status": "success", "session_id": session_id, **result.model_dump()}


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
    web_search: bool       = Form(default=False),
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

    # ── Optional live web search ─────────────────────────────────────────
    web_results: list[dict] = []
    web_ctx = ""
    if web_search:
        search_query = build_search_query(clean_q)
        try:
            web_results = await asyncio.to_thread(search_web, search_query)
        except Exception as _web_err:
            logger.debug("Web search skipped: %s", _web_err)
            web_results = []
        if web_results:
            web_ctx = "\n".join(
                f"{i + 1}. {r['title']} — {r['snippet']}\n   URL: {r['url']}"
                for i, r in enumerate(web_results)
            )

    # ── LLM ───────────────────────────────────────────────────────────────────
    try:
        raw_response = get_copilot_response(combined_msg, history, extra_context=module_ctx, web_context=web_ctx)
    except Exception as exc:
        logger.error("Copilot upload LLM error | ip=%s | file=%s | error=%s", ip, filename, exc)
        raise HTTPException(500, f"LLM error: {exc}")

    safe_response, _ = validate_output(raw_response, context=combined_msg)

    # ── Persist ───────────────────────────────────────────────────────────────
    display_user = f"📎 {filename}\n{user_question}"
    add_message(sid, "user",      display_user)
    add_message(sid, "assistant", safe_response)

    upload_turn = [{"role": "user", "content": display_user}, {"role": "assistant", "content": safe_response}]
    asyncio.create_task(asyncio.to_thread(mem0_add, upload_turn, sid))
    asyncio.create_task(zep_add_messages(sid, upload_turn))

    sources = filter_cited_sources(safe_response, web_results)
    return ChatResponse(response=safe_response, session_id=sid, status="success", warnings=warnings, sources=sources)


@router.get("/health")
async def copilot_health():
    return {"status": "CivilAI Copilot Ready"}


@router.get("/usage")
async def get_usage():
    """Today's usage (UTC) for the widget's usage gauges — see app/services/usage_tracker.py."""
    return usage_tracker.get_usage(key_pool_size=get_key_pool_size())


# ── Chat session history (the floating widget's "New Chat" / History list) ────

class ChatSessionUpsert(BaseModel):
    id: str
    label: str = ""
    messages: list = []


@router.get("/sessions")
async def list_chat_sessions(limit: int = 30):
    """List saved copilot chat-widget sessions, newest first."""
    from app.core.database import supabase
    try:
        rows = (
            supabase.table("copilot_chat_sessions")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data or []
        )
        return {"sessions": rows}
    except Exception as exc:
        raise HTTPException(500, f"Failed to fetch chat sessions: {exc}")


@router.post("/sessions")
async def upsert_chat_session(body: ChatSessionUpsert):
    """Create or update a chat-widget session (auto-saved after each turn)."""
    from app.core.database import supabase
    try:
        res = supabase.table("copilot_chat_sessions").upsert({
            "id": body.id,
            "label": body.label,
            "messages": body.messages,
        }).execute()
        return {"success": True, "session": res.data[0] if res.data else None}
    except Exception as exc:
        raise HTTPException(500, f"Failed to save chat session: {exc}")


@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    from app.core.database import supabase
    try:
        supabase.table("copilot_chat_sessions").delete().eq("id", session_id).execute()
        return {"success": True, "deleted": session_id}
    except Exception as exc:
        raise HTTPException(500, f"Failed to delete chat session: {exc}")


# ── Chat transcript PDF persistence ────────────────────────────────────────────

_CHAT_TRANSCRIPT_BUCKET = "chat-transcripts"


def _ensure_chat_bucket(sb) -> None:
    try:
        sb.storage.create_bucket(_CHAT_TRANSCRIPT_BUCKET, options={"public": True})
    except Exception:
        pass  # already exists


@router.post("/transcripts/save")
async def save_chat_transcript(
    pdf:      UploadFile = File(...),
    messages: str        = Form(default="[]"),
    label:    str        = Form(default=""),
):
    """Save a PDF export of a chat-widget conversation to Supabase storage + DB."""
    from app.core.database import supabase

    pdf_bytes = await pdf.read()
    if not pdf_bytes:
        raise HTTPException(400, "Empty PDF")

    _ensure_chat_bucket(supabase)

    pdf_filename = f"chat-{uuid.uuid4()}.pdf"
    pdf_url = ""
    try:
        supabase.storage.from_(_CHAT_TRANSCRIPT_BUCKET).upload(
            path=pdf_filename,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        pdf_url = supabase.storage.from_(_CHAT_TRANSCRIPT_BUCKET).get_public_url(pdf_filename)
    except Exception as exc:
        logger.warning("Chat transcript PDF upload failed: %s", exc)
        pdf_filename = ""

    try:
        parsed_messages = json.loads(messages)
    except Exception:
        parsed_messages = []

    try:
        rec = supabase.table("copilot_chat_transcripts").insert({
            "label":    label,
            "messages": parsed_messages,
            "pdf_path": pdf_filename,
            "pdf_url":  pdf_url,
        }).execute()
        record = rec.data[0] if rec.data else {}
    except Exception as exc:
        logger.error("copilot_chat_transcripts insert failed: %s", exc)
        raise HTTPException(500, f"Database save failed: {exc}")

    return {"success": True, "record": record, "pdf_url": pdf_url}


# ── Favicon proxy ───────────────────────────────────────────────────────────────
# Google's favicon service doesn't send CORS headers, so the frontend can't read
# the bytes directly (fetch/blob) to embed in a jsPDF-generated PDF — only <img>
# display works cross-origin. This proxies the fetch through our own CORS-enabled
# API so both the chat UI and the PDF export can use one consistent URL.

@router.get("/favicon")
async def get_favicon(url: str):
    try:
        domain = urlparse(url).hostname or url
    except Exception:
        domain = url

    favicon_url = f"https://www.google.com/s2/favicons?sz=32&domain={domain}"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(favicon_url)
        # Google's favicon service returns 404 with a usable fallback globe icon
        # for domains it doesn't recognize — that's not a real failure, so we
        # only bail out if the body is actually empty.
        if not resp.content:
            raise HTTPException(502, "Favicon fetch failed")
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/png"),
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug("Favicon fetch failed for %s: %s", url, exc)
        raise HTTPException(502, "Favicon fetch failed")
