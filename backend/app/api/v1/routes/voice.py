"""
Voice API — three endpoints:

  POST /transcribe   audio file  → { transcript, status }
  POST /speak        text form   → MP3 audio bytes
  POST /voice-chat   audio file  → MP3 audio bytes
                                   + X-Transcript / X-Response / X-Status headers
  GET  /voices       → list of available TTS voices
  GET  /health       → liveness check
"""
import json
import logging
import urllib.parse
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

from app.ai.voice_processor import transcribe_audio, text_to_speech, AVAILABLE_VOICES, diarize_with_transcript
from app.ai.vad_processor import webrtc_vad, silero_vad, diarize, detect_wakeword_oww
from app.ai.copilot import get_copilot_response
from app.core.guardrails import sanitize_prompt, validate_output
from app.core.llama_guard import check_input
from app.services.voice_db_service import build_module_context

router = APIRouter()
logger = logging.getLogger("civilai.voice")

_MAX_AUDIO_MB = 25   # Groq Whisper limit


# ── Response models ────────────────────────────────────────────────────────────

class TranscriptResult(BaseModel):
    transcript: str
    status: str = "success"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_header(value: str, max_len: int = 400) -> str:
    """URL-encode a string for use in an HTTP header value."""
    return urllib.parse.quote(value[:max_len], safe="")


def _check_size(data: bytes) -> None:
    if len(data) > _MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(413, f"Audio file exceeds {_MAX_AUDIO_MB} MB")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/transcribe", response_model=TranscriptResult)
async def transcribe_endpoint(audio: UploadFile = File(...)):
    """Upload an audio file (webm / mp3 / wav / m4a) and receive the transcript."""
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file")
    _check_size(audio_bytes)

    try:
        transcript = transcribe_audio(audio_bytes, audio.filename or "audio.webm")
    except Exception as exc:
        logger.error("Transcription error: %s", exc)
        raise HTTPException(500, f"Transcription failed: {exc}")

    return TranscriptResult(transcript=transcript)


@router.post("/speak")
async def speak_endpoint(
    text:  str = Form(...),
    voice: str = Form(default="tara"),
):
    """Convert text to MP3 speech using Groq PlayAI TTS."""
    if not text.strip():
        raise HTTPException(400, "text cannot be empty")
    try:
        audio_bytes = text_to_speech(text[:1000], voice=voice)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("TTS error: %s", exc)
        raise HTTPException(500, f"TTS failed: {exc}")


@router.post("/voice-chat")
async def voice_chat_endpoint(
    audio:            UploadFile = File(...),
    chat_history:     str        = Form(default="[]"),
    session_id:       str        = Form(default=""),
    require_wakeword: bool       = Form(default=False),
    wakeword_threshold: float    = Form(default=0.5),
):
    """
    Voice pipeline — STT + LLM only. TTS is handled by the browser (Web Speech API).
    Returns JSON: { transcript, response, status, wakeword? }

    require_wakeword    false (default) — always process audio
                        true            — only process if a wake word is detected first;
                                          returns { status: "no_wakeword" } otherwise
    wakeword_threshold  confidence cutoff 0–1 (default 0.5, only used when require_wakeword=true)
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file")
    _check_size(audio_bytes)

    # 0 — Optional wake word gate (runs locally, no API cost)
    detected_wakeword = None
    if require_wakeword:
        ww_result = detect_wakeword_oww(audio_bytes, threshold=max(0.0, min(1.0, wakeword_threshold)))
        detections = ww_result.get("detections", [])
        if not detections:
            return {"status": "no_wakeword", "detections": []}
        detected_wakeword = detections[0]["wake_word"]

    # 1 — STT
    try:
        transcript = transcribe_audio(audio_bytes, audio.filename or "audio.webm")
    except Exception as exc:
        raise HTTPException(500, f"Transcription failed: {exc}")

    if not transcript.strip():
        raise HTTPException(400, "Could not transcribe audio — please speak clearly and try again")

    # 2 — Sanitize + safety screen
    try:
        clean_msg, _ = sanitize_prompt(transcript)
    except ValueError:
        return {
            "transcript": transcript,
            "response":   "I'm sorry, I can't respond to that. Please rephrase and ask something related to construction management.",
            "status":     "input_blocked",
        }

    input_safe, _violation = check_input(clean_msg)
    if not input_safe:
        return {
            "transcript": transcript,
            "response":   "I'm sorry, I can't respond to that. Please ask something related to construction management.",
            "status":     "input_blocked",
        }

    # 3 — Parse history + LLM call
    try:
        history = json.loads(chat_history) if chat_history else []
        if not isinstance(history, list):
            history = []
    except Exception:
        history = []

    # Fetch live project data from other modules based on keywords in the query
    try:
        module_ctx = build_module_context(clean_msg)
    except Exception:
        module_ctx = ""

    try:
        response_text = get_copilot_response(clean_msg, history, extra_context=module_ctx)
    except Exception as exc:
        raise HTTPException(500, f"LLM error: {exc}")

    safe_response, _ = validate_output(response_text, context=clean_msg)

    result = {
        "transcript": transcript,
        "response":   safe_response,
        "status":     "success",
    }
    if detected_wakeword:
        result["wakeword"] = detected_wakeword
    return result


@router.get("/voices")
async def list_voices():
    """List all available TTS voices."""
    return {"voices": AVAILABLE_VOICES, "default": "Celeste-PlayAI"}


@router.get("/health")
async def voice_health():
    return {
        "status": "Voice API ready",
        "stt":    f"Groq {_MAX_AUDIO_MB}MB limit — Whisper large-v3",
        "tts":    "Groq PlayAI (gTTS fallback)",
        "vad":    ["webrtcvad", "silero-vad"],
        "diarization": "pyannote-audio",
        "wakeword":    "openwakeword",
    }


# ── Voice Activity Detection ───────────────────────────────────────────────────

@router.post("/vad")
async def vad_endpoint(
    audio:          UploadFile = File(...),
    engine:         str        = Form(default="webrtc"),
    aggressiveness: int        = Form(default=2),
    threshold:      float      = Form(default=0.5),
):
    """
    Detect speech vs silence in an audio file.

    engine         "webrtc"  — Google WebRTC VAD (fast, lightweight, frame-level)
                   "silero"  — Silero ML VAD (more accurate on noisy inputs)
    aggressiveness 0–3 (webrtc only; higher = more aggressive silence filtering)
    threshold      0–1 speech probability cutoff (silero only; default 0.5)

    Input:  WAV audio (other formats supported by silero; webrtc requires WAV)
    Output: { segments, speech_ratio|engine }
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file")
    _check_size(audio_bytes)

    if engine == "silero":
        return silero_vad(audio_bytes, threshold=max(0.0, min(1.0, threshold)))
    return webrtc_vad(audio_bytes, aggressiveness=max(0, min(3, aggressiveness)))


# ── Speaker Diarization ────────────────────────────────────────────────────────

@router.post("/diarize")
async def diarize_endpoint(
    audio:               UploadFile    = File(...),
    num_speakers:        Optional[int] = Form(default=None),
    include_transcript:  bool          = Form(default=False),
):
    """
    Label which speaker is talking at each moment.

    Uses pyannote-audio 3.1 (state-of-the-art).

    num_speakers         Optional speaker count hint — improves accuracy.
    include_transcript   When true, also transcribes each speaker turn via
                         Whisper verbose_json and returns a dialogue list.

    Output: { segments, num_speakers, engine, dialogue? }
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file")
    _check_size(audio_bytes)
    if include_transcript:
        return diarize_with_transcript(audio_bytes, num_speakers=num_speakers)
    return diarize(audio_bytes, num_speakers=num_speakers)


# ── Meeting Summary ────────────────────────────────────────────────────────────

@router.post("/meeting-summary")
async def meeting_summary_endpoint(
    dialogue: str = Form(...),
):
    """
    Summarize a diarized meeting transcript.

    dialogue   JSON array of { speaker, start, end, text } from /diarize
               (pass the dialogue field returned when include_transcript=true)

    Output: { summary }
    """
    try:
        items = json.loads(dialogue)
        lines = [
            f"{item['speaker']} [{item.get('start', 0):.1f}s]: {item['text']}"
            for item in items if item.get("text")
        ]
        if not lines:
            raise HTTPException(400, "No dialogue content to summarize")

        transcript_text = "\n".join(lines)
        prompt = (
            "You are a construction project meeting analyst. "
            "Analyse the following meeting transcript and produce a structured summary using bold section headings and bullet points. "
            "Use this exact format:\n\n"
            "**Meeting Overview**\n- Date, attendees (inferred), duration\n\n"
            "**Key Decisions**\n- Each decision as a bullet with the decision-maker named where identifiable\n\n"
            "**Action Items**\n- Each action with owner, deliverable, and target date\n\n"
            "**Risks & Blockers**\n- Each risk with severity and potential programme/cost impact\n\n"
            "**Technical Topics Discussed**\n- Summarise each technical item with relevant terminology (CPM, EVM, NCR, ITP, RFI, etc.)\n\n"
            "**Next Steps**\n- Prioritised list of follow-up tasks\n\n"
            "Use professional construction management terminology throughout. "
            "Be thorough — the audience is project directors and senior engineers.\n\n"
            "Meeting Transcript:\n" + transcript_text
        )
        summary = get_copilot_response(prompt, [])
        return {"summary": summary}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Meeting summary error: %s", exc)
        raise HTTPException(500, f"Summary failed: {exc}")


# ── Meeting persistence (save PDF + metadata to Supabase) ─────────────────────

_MEETING_BUCKET = "meeting-reports"
_AUDIO_BUCKET   = "voice-audio"


def _ensure_bucket(sb, name: str = _MEETING_BUCKET) -> None:
    try:
        sb.storage.create_bucket(name, options={"public": True})
    except Exception:
        pass  # already exists


def _upload_audio(sb, audio_file: Optional[UploadFile], audio_bytes: bytes, prefix: str) -> str:
    """Upload raw audio to voice-audio bucket; return public URL or ''."""
    if not audio_bytes:
        return ""
    _ensure_bucket(sb, _AUDIO_BUCKET)
    ext = (audio_file.filename or "audio.webm").rsplit(".", 1)[-1].lower()
    audio_filename = f"{prefix}-{uuid.uuid4()}.{ext}"
    content_type = f"audio/{ext}" if ext not in ("mp4", "m4a") else "audio/mp4"
    try:
        sb.storage.from_(_AUDIO_BUCKET).upload(
            path=audio_filename,
            file=audio_bytes,
            file_options={"content-type": content_type},
        )
        return sb.storage.from_(_AUDIO_BUCKET).get_public_url(audio_filename)
    except Exception as exc:
        logger.warning("Audio upload failed: %s", exc)
        return ""


@router.post("/meetings/save")
async def save_meeting_endpoint(
    pdf:          UploadFile          = File(...),
    audio:        Optional[UploadFile] = File(default=None),
    dialogue:     str                 = Form(default="[]"),
    summary:      str                 = Form(default=""),
    filename:     str                 = Form(default="recording"),
    num_speakers: int                 = Form(default=0),
    segments:     str                 = Form(default="[]"),
):
    """
    Save a meeting analysis to the database.
    Accepts the generated PDF and optionally the original audio file.
    Uses the service-role key so it can create storage buckets automatically.

    Output: { success, record, pdf_url, audio_url }
    """
    from app.core.database import supabase

    pdf_bytes   = await pdf.read()
    audio_bytes = await audio.read() if audio else b""
    if not pdf_bytes:
        raise HTTPException(400, "Empty PDF")

    _ensure_bucket(supabase, _MEETING_BUCKET)

    # Upload PDF
    pdf_filename = f"meeting-{uuid.uuid4()}.pdf"
    pdf_url = ""
    try:
        supabase.storage.from_(_MEETING_BUCKET).upload(
            path=pdf_filename,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        pdf_url = supabase.storage.from_(_MEETING_BUCKET).get_public_url(pdf_filename)
    except Exception as exc:
        logger.warning("PDF upload failed: %s", exc)
        pdf_filename = ""

    # Upload audio (optional)
    audio_url = _upload_audio(supabase, audio, audio_bytes, "meeting")

    # Save metadata to DB
    try:
        rec = supabase.table("meeting_recordings").insert({
            "filename":     filename,
            "pdf_path":     pdf_filename,
            "pdf_url":      pdf_url,
            "audio_url":    audio_url,
            "num_speakers": num_speakers,
            "segments":     json.loads(segments),
            "dialogue":     json.loads(dialogue),
            "summary":      summary,
        }).execute()
        record = rec.data[0] if rec.data else {}
    except Exception as exc:
        logger.error("meeting_recordings insert failed: %s", exc)
        raise HTTPException(500, f"Database save failed: {exc}")

    return {"success": True, "record": record, "pdf_url": pdf_url, "audio_url": audio_url}


# ── Transcription persistence ──────────────────────────────────────────────────

_TRANSCRIPTION_BUCKET = "transcription-reports"


@router.post("/transcriptions/save")
async def save_transcription_endpoint(
    pdf:        UploadFile          = File(...),
    audio:      Optional[UploadFile] = File(default=None),
    transcript: str                 = Form(default=""),
    minutes:    str                 = Form(default=""),
    filename:   str                 = Form(default="recording"),
):
    """
    Save a transcription result (PDF + optional audio) to Supabase.
    Creates the transcription-reports and voice-audio buckets automatically.

    Output: { success, record, pdf_url, audio_url }
    """
    from app.core.database import supabase

    pdf_bytes   = await pdf.read()
    audio_bytes = await audio.read() if audio else b""
    if not pdf_bytes:
        raise HTTPException(400, "Empty PDF")

    _ensure_bucket(supabase, _TRANSCRIPTION_BUCKET)

    # Upload PDF
    pdf_filename = f"transcription-{uuid.uuid4()}.pdf"
    pdf_url = ""
    try:
        supabase.storage.from_(_TRANSCRIPTION_BUCKET).upload(
            path=pdf_filename,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        pdf_url = supabase.storage.from_(_TRANSCRIPTION_BUCKET).get_public_url(pdf_filename)
    except Exception as exc:
        logger.warning("Transcription PDF upload failed: %s", exc)
        pdf_filename = ""

    # Upload audio (optional)
    audio_url = _upload_audio(supabase, audio, audio_bytes, "transcription")

    # Save metadata to DB
    try:
        rec = supabase.table("transcription_recordings").insert({
            "filename":   filename,
            "transcript": transcript,
            "minutes":    minutes,
            "pdf_path":   pdf_filename,
            "pdf_url":    pdf_url,
            "audio_url":  audio_url,
        }).execute()
        record = rec.data[0] if rec.data else {}
    except Exception as exc:
        logger.error("transcription_recordings insert failed: %s", exc)
        raise HTTPException(500, f"Database save failed: {exc}")

    return {"success": True, "record": record, "pdf_url": pdf_url, "audio_url": audio_url}

@router.get("/meetings")
async def list_meetings_endpoint(limit: int = 30):
    """List saved meeting recordings, newest first."""
    from app.core.database import supabase
    try:
        rows = (
            supabase.table("meeting_recordings")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data or []
        )
        return {"meetings": rows}
    except Exception as exc:
        raise HTTPException(500, f"Failed to fetch meetings: {exc}")


# ── VAD persistence ────────────────────────────────────────────────────────────

_VAD_BUCKET = "vad-reports"


@router.post("/vad/save")
async def save_vad_endpoint(
    pdf:          UploadFile          = File(...),
    audio:        Optional[UploadFile] = File(default=None),
    filename:     str                 = Form(default="recording"),
    engine:       str                 = Form(default="webrtc"),
    speech_ratio: float               = Form(default=0.0),
    num_segments: int                 = Form(default=0),
    segments:     str                 = Form(default="[]"),
):
    """
    Save a VAD analysis result, its generated PDF, and optionally the original audio.
    Auto-creates the vad-reports and voice-audio buckets on first use.

    Output: { success, record, pdf_url, audio_url }
    """
    from app.core.database import supabase

    pdf_bytes   = await pdf.read()
    audio_bytes = await audio.read() if audio else b""
    if not pdf_bytes:
        raise HTTPException(400, "Empty PDF")

    _ensure_bucket(supabase, _VAD_BUCKET)

    # Upload PDF
    pdf_filename = f"vad-{uuid.uuid4()}.pdf"
    pdf_url = ""
    try:
        supabase.storage.from_(_VAD_BUCKET).upload(
            path=pdf_filename,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        pdf_url = supabase.storage.from_(_VAD_BUCKET).get_public_url(pdf_filename)
    except Exception as exc:
        logger.warning("VAD PDF upload failed: %s", exc)
        pdf_filename = ""

    # Upload audio (optional)
    audio_url = _upload_audio(supabase, audio, audio_bytes, "vad")

    # Save to DB
    try:
        rec = supabase.table("vad_recordings").insert({
            "filename":     filename,
            "engine":       engine,
            "pdf_path":     pdf_filename,
            "pdf_url":      pdf_url,
            "audio_url":    audio_url,
            "speech_ratio": speech_ratio,
            "num_segments": num_segments,
            "segments":     json.loads(segments),
        }).execute()
        record = rec.data[0] if rec.data else {}
    except Exception as exc:
        logger.error("vad_recordings insert failed: %s", exc)
        raise HTTPException(500, f"Database save failed: {exc}")

    return {"success": True, "record": record, "pdf_url": pdf_url, "audio_url": audio_url}
