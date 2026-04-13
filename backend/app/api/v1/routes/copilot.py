from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.copilot import get_copilot_response

router = APIRouter()

class ChatMessage(BaseModel):
    message: str
    chat_history: list = []

class ChatResponse(BaseModel):
    response: str
    status: str = "success"

@router.post("/chat", response_model=ChatResponse)
async def chat_with_copilot(payload: ChatMessage):
    try:
        response = get_copilot_response(
            payload.message,
            payload.chat_history
        )
        return ChatResponse(response=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def copilot_health():
    return {"status": "CivilAI Copilot Ready"}
