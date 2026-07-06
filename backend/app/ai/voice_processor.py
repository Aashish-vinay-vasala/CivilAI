"""
Voice pipeline: STT (Groq Whisper large-v3) + TTS (Groq PlayAI).

No extra pip installs required beyond the `groq` package already in requirements.
gTTS is used as a free fallback if Groq TTS is unavailable (add gTTS to requirements).
"""
import io
import os
import logging
import tempfile
from typing import Optional
from groq import Groq
from app.config import settings
from app.services import usage_tracker

logger = logging.getLogger("civilai.voice")

_groq = Groq(api_key=settings.GROQ_API_KEY)

_STT_MODEL  = "whisper-large-v3"
_TTS_MODEL  = "canopylabs/orpheus-v1-english"
_TTS_VOICE  = "autumn"   # clear professional female voice

# Orpheus v1 English voices actually enabled for this Groq account — the model
# supports a larger named set, but requesting one outside this list 400s and we
# silently fall back to gTTS, so keep this in sync with console.groq.com.
AVAILABLE_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"]


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    STT: raw audio bytes → transcript text via Groq Whisper large-v3.
    Writes to a temp file because the Groq SDK requires a seekable file object.
    Supports: webm, mp3, mp4, wav, flac, m4a, ogg (≤25 MB).
    """
    if not audio_bytes:
        raise ValueError("Empty audio data")

    usage_tracker.add_audio_call()
    suffix  = ("." + filename.rsplit(".", 1)[-1]) if "." in filename else ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        with open(tmp_path, "rb") as f:
            result = _groq.audio.transcriptions.create(
                file=(filename, f),
                model=_STT_MODEL,
                response_format="text",
                language="en",
            )

        # response_format="text" returns the transcript as a plain string
        text = result if isinstance(result, str) else getattr(result, "text", str(result))
        return text.strip()

    except Exception as exc:
        logger.error("Groq Whisper STT failed: %s", exc)
        raise
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def text_to_speech(text: str, voice: str = _TTS_VOICE) -> bytes:
    """
    TTS: text → MP3 audio bytes via Groq PlayAI TTS.
    Falls back to gTTS (free Google TTS, no API key) if Groq TTS fails.
    """
    if not text or not text.strip():
        raise ValueError("Empty text for TTS")

    if voice not in AVAILABLE_VOICES:
        voice = _TTS_VOICE

    try:
        response = _groq.audio.speech.create(
            model=_TTS_MODEL,
            voice=voice,
            input=text[:4096],
            response_format="mp3",
        )
        return response.read()

    except Exception as exc:
        logger.warning("Groq PlayAI TTS failed (%s), falling back to gTTS", exc)
        return _gtts_fallback(text)


def diarize_with_transcript(audio_bytes: bytes, num_speakers: Optional[int] = None) -> dict:
    """
    Speaker diarization + per-turn transcript with speaker labels.

    Runs pyannote diarization to get speaker segments, then transcribes
    the full audio once with Whisper verbose_json, and maps each Whisper
    segment to the dominant speaker by timestamp overlap.
    """
    from app.ai.vad_processor import diarize

    diar = diarize(audio_bytes, num_speakers)
    if "error" in diar:
        return diar

    try:
        tmp_path = None
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as f:
                result = _groq.audio.transcriptions.create(
                    file=("audio.wav", f),
                    model=_STT_MODEL,
                    response_format="verbose_json",
                    language="en",
                )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        raw_segs = getattr(result, "segments", None) or []

    except Exception as exc:
        logger.error("Whisper verbose_json failed in diarize_with_transcript: %s", exc)
        return {**diar, "dialogue": [], "transcript_error": str(exc)[:200]}

    def _v(obj, key, default=0):
        return getattr(obj, key, None) if hasattr(obj, key) else (obj.get(key, default) if isinstance(obj, dict) else default)

    diar_segs = diar["segments"]
    merged: list[dict] = []

    for ws in raw_segs:
        ws_start = _v(ws, "start", 0)
        ws_end   = _v(ws, "end",   0)
        ws_text  = (_v(ws, "text", "") or "").strip()
        if not ws_text:
            continue

        best_speaker, best_overlap = "SPEAKER", 0.0
        for ds in diar_segs:
            ov = min(ws_end, ds["end"]) - max(ws_start, ds["start"])
            if ov > best_overlap:
                best_overlap = ov
                best_speaker = ds["speaker"]

        if merged and merged[-1]["speaker"] == best_speaker:
            merged[-1]["text"] += " " + ws_text
            merged[-1]["end"]   = round(ws_end, 2)
        else:
            merged.append({
                "speaker": best_speaker,
                "start":   round(ws_start, 2),
                "end":     round(ws_end, 2),
                "text":    ws_text,
            })

    return {**diar, "dialogue": merged}


def _gtts_fallback(text: str) -> bytes:
    """Free Google TTS fallback — works without any API key, requires internet."""
    try:
        from gtts import gTTS
        buf = io.BytesIO()
        gTTS(text=text[:500], lang="en", slow=False).write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except ImportError:
        raise RuntimeError("TTS unavailable: Groq TTS failed and gTTS is not installed. Run: pip install gTTS")
    except Exception as exc:
        logger.error("gTTS fallback also failed: %s", exc)
        raise RuntimeError(f"All TTS providers failed: {exc}") from exc
