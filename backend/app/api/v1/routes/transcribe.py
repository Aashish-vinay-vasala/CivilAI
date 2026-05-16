from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.ai.groq_client import client
import tempfile, os

router = APIRouter()

SUPPORTED = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"}

@router.post("")
@router.post("/")
async def transcribe_audio(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "audio.webm")[1].lower()
    if ext not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Use: {', '.join(SUPPORTED)}")

    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 25MB limit")

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=(os.path.basename(tmp_path), audio_file, file.content_type or "audio/webm"),
                    response_format="text",
                )
            return {"status": "success", "transcript": str(transcription)}
        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
