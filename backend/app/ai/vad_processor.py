"""
Advanced voice processing — VAD, speaker diarization, and wake word detection.

VAD (Voice Activity Detection):
  webrtc_vad()   — Google's WebRTC VAD, lightweight, frame-level speech/silence
  silero_vad()   — ML-based, more accurate on noisy inputs (uses PyTorch)

Speaker Diarization:
  diarize()      — pyannote-audio 3.1 state-of-the-art speaker labelling
  One-time setup: accept model at huggingface.co/pyannote/speaker-diarization-3.1
  HUGGINGFACE_TOKEN already in .env is used automatically.

Wake Word Detection:
  detect_wakeword_oww() — OpenWakeWord (free, no account, no API key)

All functions gracefully return an error dict if the backing package isn't installed
or the model hasn't been accepted yet — the rest of the app keeps running.

Required packages:
  webrtcvad-wheels    lightweight WebRTC VAD with pre-built wheels
  silero-vad          ML VAD (downloads ~1MB model on first use via torch.hub)
  pyannote.audio      speaker diarization (downloads ~200MB model on first use)
  openwakeword        free wake word detection (downloads ONNX models on first use)
"""
import io
import logging
import os
import struct
import tempfile
import types
import wave
from typing import Optional

logger = logging.getLogger("civilai.vad")

# Import lazily to avoid circular imports at module load time
def _get_hf_token() -> str:
    try:
        from app.config import settings
        return settings.HUGGINGFACE_TOKEN or ""
    except Exception:
        return os.getenv("HUGGINGFACE_TOKEN", "")

# ── Lazy-loaded singletons ─────────────────────────────────────────────────────
_silero_model      = None
_pyannote_pipeline = None
_oww_model         = None


# ── PCM helpers (no external deps) ────────────────────────────────────────────

def _read_wav_pcm(audio_bytes: bytes) -> tuple[bytes, int, int]:
    """Return (pcm_bytes, sample_rate, num_channels) from WAV, M4A, MP3, WebM, or any audio bytes."""
    # Fast path: WAV via stdlib (no external deps)
    try:
        with wave.open(io.BytesIO(audio_bytes)) as wf:
            return wf.readframes(wf.getnframes()), wf.getframerate(), wf.getnchannels()
    except Exception:
        pass

    # General path: PyAV handles M4A, MP3, WebM, OGG, AAC, etc.
    try:
        import av  # type: ignore[import-untyped]
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            frames_bytes, sample_rate, channels = [], 0, 1
            with av.open(tmp_path) as container:
                stream = container.streams.audio[0]
                sample_rate = stream.sample_rate or 16000
                channels = stream.channels or 1
                layout = "stereo" if channels >= 2 else "mono"
                resampler = av.AudioResampler(format="s16", layout=layout, rate=sample_rate)
                for packet in container.demux(stream):
                    for frame in packet.decode():
                        for rf in resampler.resample(frame):
                            frames_bytes.append(bytes(rf.planes[0]))
                for rf in resampler.resample(None):
                    frames_bytes.append(bytes(rf.planes[0]))
            return b"".join(frames_bytes), sample_rate, channels
        finally:
            os.unlink(tmp_path)
    except Exception:
        return b"", 0, 0


def _to_mono_16k(pcm: bytes, sample_rate: int, channels: int) -> bytes:
    """Convert 16-bit PCM to mono 16 kHz using pure Python (no external deps)."""
    if not pcm:
        return b""

    samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)

    if channels == 2:
        samples = tuple(
            (samples[i] + samples[i + 1]) // 2
            for i in range(0, len(samples) - 1, 2)
        )

    if sample_rate != 16000 and sample_rate > 0:
        step = sample_rate / 16000
        out, idx = [], 0.0
        while idx < len(samples):
            out.append(samples[int(idx)])
            idx += step
        samples = tuple(out)

    return struct.pack(f"<{len(samples)}h", *samples)


# ── WebRTC VAD ─────────────────────────────────────────────────────────────────

def webrtc_vad(
    audio_bytes: bytes,
    aggressiveness: int = 2,
    frame_ms: int = 30,
) -> dict:
    """
    Frame-level speech/silence detection via Google's WebRTC VAD.

    audio_bytes      WAV audio (any sample rate — converted to 16 kHz internally)
    aggressiveness   0 (least) – 3 (most aggressive filtering of non-speech)
    frame_ms         Frame duration in ms: 10, 20, or 30

    Returns:
      {
        segments:     [{start_ms, end_ms, speech}],
        speech_ratio: float,   # fraction of frames classified as speech
        engine:       "webrtcvad"
      }
    """
    try:
        import webrtcvad  # type: ignore[import-untyped]
    except ImportError:
        return {"error": "webrtcvad-wheels not installed — run: pip install webrtcvad-wheels",
                "segments": [], "engine": "webrtcvad"}

    pcm, sr, ch = _read_wav_pcm(audio_bytes)
    if not pcm:
        return {"error": "Could not parse audio. Send WAV format.",
                "segments": [], "engine": "webrtcvad"}

    pcm  = _to_mono_16k(pcm, sr, ch)
    sr16 = 16000
    vad  = webrtcvad.Vad(max(0, min(3, aggressiveness)))

    frame_bytes = int(sr16 * frame_ms / 1000) * 2  # 2 bytes per 16-bit sample
    segments, speech_count = [], 0
    offset = 0
    while offset + frame_bytes <= len(pcm):
        frame    = pcm[offset:offset + frame_bytes]
        ts_ms    = int(offset / 2 / sr16 * 1000)
        try:
            is_speech = vad.is_speech(frame, sr16)
        except Exception:
            is_speech = False
        segments.append({"start_ms": ts_ms, "end_ms": ts_ms + frame_ms, "speech": is_speech})
        if is_speech:
            speech_count += 1
        offset += frame_bytes

    return {
        "segments":     segments,
        "speech_ratio": round(speech_count / max(len(segments), 1), 3),
        "engine":       "webrtcvad",
    }


# ── Silero VAD ─────────────────────────────────────────────────────────────────

def _load_silero() -> Optional[tuple]:
    global _silero_model
    if _silero_model is not None:
        return _silero_model

    # Try pip package first (silero-vad v5+ API)
    try:
        from silero_vad import load_silero_vad, get_speech_timestamps  # type: ignore[import-untyped]
        model = load_silero_vad()
        _silero_model = (model, get_speech_timestamps)
        logger.info("Silero VAD loaded from pip package (v5+ API)")
        return _silero_model
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Silero VAD pip load failed: %s", exc)

    # Fall back to torch.hub (v4 API)
    try:
        import torch  # type: ignore[import-untyped]
        model, utils = torch.hub.load(
            "snakers4/silero-vad", "silero_vad",
            force_reload=False, trust_repo=True,
        )
        get_speech_ts = utils[0]
        _silero_model = (model, get_speech_ts)
        logger.info("Silero VAD loaded from torch.hub (v4 API)")
        return _silero_model
    except Exception as exc:
        logger.warning("Silero VAD torch.hub load failed: %s", exc)
        return None


def silero_vad(audio_bytes: bytes, threshold: float = 0.5) -> dict:
    """
    ML-based speech segment detection via Silero VAD.
    More accurate than WebRTC VAD on noisy or far-field audio.

    Supports WAV, M4A, MP3, WebM, and any format PyAV can decode.
    Downloads ~1 MB model on first call (cached).

    audio_bytes   Any audio format
    threshold     Speech probability threshold 0–1 (default 0.5)

    Returns:
      { segments: [{start, end}],  engine: "silero-vad" }
      Times are in seconds.
    """
    loaded = _load_silero()
    if loaded is None:
        return {"error": "silero-vad unavailable — run: pip install silero-vad",
                "segments": [], "engine": "silero-vad"}
    try:
        import torch   # type: ignore[import-untyped]
        import numpy as np  # type: ignore[import-untyped]

        model, get_speech_ts = loaded

        # Decode any audio format → mono 16 kHz 16-bit PCM
        pcm, sr, ch = _read_wav_pcm(audio_bytes)
        if not pcm:
            return {"error": "Could not decode audio. Send WAV, M4A, MP3, or WebM.",
                    "segments": [], "engine": "silero-vad"}
        pcm16k = _to_mono_16k(pcm, sr, ch)

        # Convert to float32 tensor in [-1, 1] as Silero expects
        samples = np.frombuffer(pcm16k, dtype=np.int16).astype(np.float32) / 32768.0
        wav = torch.from_numpy(samples)

        raw_segs = get_speech_ts(wav, model, threshold=threshold, sampling_rate=16000)

        return {
            "segments": [
                {"start": round(s["start"] / 16000, 3), "end": round(s["end"] / 16000, 3)}
                for s in raw_segs
            ],
            "engine": "silero-vad",
        }
    except Exception as exc:
        logger.error("Silero VAD error: %s", exc)
        return {"error": str(exc), "segments": [], "engine": "silero-vad"}


# ── Speaker Diarization ────────────────────────────────────────────────────────

def _load_pyannote():
    global _pyannote_pipeline
    if _pyannote_pipeline is not None:
        return _pyannote_pipeline
    token = _get_hf_token()
    if not token:
        logger.warning("HUGGINGFACE_TOKEN not set — pyannote diarization unavailable")
        return None
    try:
        import warnings
        with warnings.catch_warnings():
            # (?s) = DOTALL — the warning text starts with a literal "\n" before
            # "torchcodec", and filterwarnings anchors with re.match() at the
            # start of the string, so without DOTALL "." never crosses that
            # newline and the filter silently never matches.
            warnings.filterwarnings("ignore", message="(?s).*torchcodec.*")
            warnings.filterwarnings("ignore", message="(?s).*libtorchcodec.*")
            from pyannote.audio import Pipeline  # type: ignore[import-untyped]
        _pyannote_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=token,
        )
        logger.info("pyannote speaker diarization pipeline loaded")
        return _pyannote_pipeline
    except ImportError as exc:
        logger.warning("pyannote.audio not installed: %s", exc)
        return None
    except Exception as exc:
        logger.error("pyannote pipeline load failed: %s", exc)
        return None


def diarize(audio_bytes: bytes, num_speakers: Optional[int] = None) -> dict:
    """
    Speaker diarization — label which speaker is talking at each moment.

    Downloads ~200 MB models from HuggingFace on first call (cached).
    One-time setup:
      Accept model at huggingface.co/pyannote/speaker-diarization-3.1
      HUGGINGFACE_TOKEN in .env is used automatically.

    audio_bytes    WAV (or any format pyannote supports)
    num_speakers   Hint for number of speakers (optional — improves accuracy)

    Returns:
      { segments: [{speaker, start, end}], num_speakers: int, engine: "pyannote" }
    """
    pipeline = _load_pyannote()
    if pipeline is None:
        return {
            "error": (
                "pyannote diarization unavailable. "
                "Accept model at huggingface.co/pyannote/speaker-diarization-3.1 "
                "then ensure HUGGINGFACE_TOKEN is set in .env."
            ),
            "segments": [],
            "engine": "pyannote",
        }
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            import torch
            import av  # type: ignore[import-untyped]
            # PyAV decodes any container (WAV, WebM, MP4, M4A, …) without system FFmpeg
            frames = []
            with av.open(tmp_path) as container:
                stream = container.streams.audio[0]
                resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
                for packet in container.demux(stream):
                    for frame in packet.decode():
                        for rf in resampler.resample(frame):
                            frames.append(rf.to_ndarray()[0])
                for rf in resampler.resample(None):   # flush
                    frames.append(rf.to_ndarray()[0])
            import numpy as np
            pcm = np.concatenate(frames) if frames else np.zeros(1, dtype=np.float32)
            waveform = torch.from_numpy(pcm).unsqueeze(0)  # (1, samples)
            audio_input = {"waveform": waveform, "sample_rate": 16000}
            try:
                result = pipeline(audio_input, **({} if num_speakers is None else {"num_speakers": num_speakers}))
                if isinstance(result, types.GeneratorType):
                    result = next(result)
            except Exception as pipeline_exc:
                # pyannote 4.x sometimes raises an exception whose first argument
                # IS the DiarizeOutput (e.g. an internal assertion with the result
                # object as context). Recover the annotation from it if possible.
                candidate = pipeline_exc.args[0] if pipeline_exc.args else None
                if hasattr(candidate, "speaker_diarization"):
                    result = candidate
                else:
                    raise
        finally:
            os.unlink(tmp_path)

        # pyannote 4.x wraps the annotation in a DiarizeOutput dataclass
        annotation = getattr(result, "speaker_diarization", result)
        segments, speakers = [], set()
        for turn, _, speaker in annotation.itertracks(yield_label=True):
            segments.append({"speaker": speaker, "start": round(turn.start, 3), "end": round(turn.end, 3)})
            speakers.add(speaker)

        return {"segments": segments, "num_speakers": len(speakers), "engine": "pyannote"}
    except Exception as exc:
        logger.error("Diarization error: %s", exc)
        return {"error": str(exc)[:300], "segments": [], "engine": "pyannote"}


# ── Wake Word — OpenWakeWord ───────────────────────────────────────────────────

def _load_oww():
    global _oww_model
    if _oww_model is not None:
        return _oww_model
    try:
        import openwakeword          # type: ignore[import-untyped]
        from openwakeword.model import Model  # type: ignore[import-untyped]
        openwakeword.utils.download_models()  # no-op if already cached
        _oww_model = Model(inference_framework="onnx")
        logger.info("OpenWakeWord model loaded")
        return _oww_model
    except ImportError as exc:
        logger.warning("openwakeword not installed: %s", exc)
        return None
    except Exception as exc:
        logger.error("OpenWakeWord load failed: %s", exc)
        return None


def detect_wakeword_oww(audio_bytes: bytes, threshold: float = 0.5) -> dict:
    """
    Wake word detection using OpenWakeWord (fully free, no API key).

    Built-in wake words include: "hey jarvis", "hey mycroft", "alexa", and others.
    Downloads ONNX models on first call.

    audio_bytes   WAV audio (16 kHz mono preferred)
    threshold     Confidence threshold 0–1 (default 0.5)

    Returns:
      { detections: [{wake_word, score, time_s}], engine: "openwakeword" }
    """
    import numpy as np  # already in requirements

    model = _load_oww()
    if model is None:
        return {"error": "openwakeword not installed — run: pip install openwakeword",
                "detections": [], "engine": "openwakeword"}
    try:
        pcm, sr, ch = _read_wav_pcm(audio_bytes)
        if not pcm:
            return {"error": "Could not parse audio. Send WAV format.",
                    "detections": [], "engine": "openwakeword"}

        pcm     = _to_mono_16k(pcm, sr, ch)
        samples = np.frombuffer(pcm, dtype=np.int16)

        chunk      = 1280  # 80 ms at 16 kHz
        detections = []
        for i in range(0, len(samples) - chunk, chunk):
            preds = model.predict(samples[i:i + chunk])
            ts_s  = round(i / 16000, 3)
            for word, score in preds.items():
                if score >= threshold:
                    detections.append({"wake_word": word, "score": round(float(score), 4), "time_s": ts_s})

        return {"detections": detections, "engine": "openwakeword"}
    except Exception as exc:
        logger.error("OpenWakeWord error: %s", exc)
        return {"error": str(exc), "detections": [], "engine": "openwakeword"}


