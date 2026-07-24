"""
PydanticAI construction agent — type-safe, structured tool-calling agent.

Alternative to the LangGraph ReAct agent (agent_copilot.py).
PydanticAI enforces structured outputs via Pydantic models, making responses
predictable and easy to validate without post-processing.

Required packages (free / open-source):
  pydantic-ai

Required env vars:
  GROQ_API_KEY   (shared with existing analyzers)
"""
import logging
import os
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("civilai.pydantic_agent")

_MODEL = f"groq:{os.getenv('GROQ_MODEL', 'llama-3.3-70b-versatile')}"

_SYSTEM = """\
You are CivilAI, an expert AI assistant for construction project management.
Answer questions about schedules, safety, cost management, procurement,
contracts, compliance, equipment, and workforce planning.

Be concise, accurate, and actionable. Reference OSHA, ACI, IBC, or FIDIC
standards when relevant. If a question is outside construction management,
politely redirect the user.
"""


class ConstructionAnswer(BaseModel):
    """Structured answer returned by the PydanticAI agent."""
    answer:     str   = Field(description="The main response to the user's question")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0–1", default=0.85)
    domain:     str   = Field(
        description="Construction domain: schedule|safety|cost|contract|workforce|procurement|compliance|equipment|general",
        default="general",
    )
    follow_up:  Optional[str] = Field(
        default=None,
        description="Optional clarifying question to ask the user if more information would help",
    )


_agent: Optional[object] = None


def _make_agent() -> Optional[object]:
    try:
        from pydantic_ai import Agent  # type: ignore[import-untyped]
        return Agent(
            _MODEL,
            result_type=ConstructionAnswer,
            system_prompt=_SYSTEM,
        )
    except ImportError as exc:
        logger.warning("pydantic-ai not available: %s", exc)
        return None
    except Exception as exc:
        logger.error("PydanticAI agent init failed: %s", exc)
        return None


def get_agent() -> Optional[object]:
    global _agent
    if _agent is None:
        _agent = _make_agent()
    return _agent


def _build_prompt(message: str, history: Optional[list[dict]], web_context: str = "") -> str:
    """Prepend the last 4 turns of history (and any live web results) to the user message."""
    prompt = message
    if history:
        lines = []
        for m in history[-4:]:
            prefix = "User" if m.get("role") == "user" else "Assistant"
            lines.append(f"{prefix}: {m.get('content', '')[:300]}")
        context = "\n".join(lines)
        prompt = f"Recent conversation:\n{context}\n\nNew question: {message}"
    if web_context:
        prompt = (
            "Live public web search results for this query (from the internet, may be more "
            "current than your training data). Only use a result if it is genuinely relevant; "
            f"cite it inline as a markdown link, e.g. [Title](URL):\n{web_context}\n\n{prompt}"
        )
    return prompt


async def pydantic_chat(
    message: str,
    history: Optional[list[dict]] = None,
    web_context: str = "",
) -> ConstructionAnswer:
    """
    Run the PydanticAI agent on a user message and return a ConstructionAnswer.

    Falls back to a plain error result if pydantic-ai is not installed or the
    Groq call fails — callers should degrade gracefully to get_copilot_response.
    """
    agent = get_agent()
    if agent is None:
        return ConstructionAnswer(
            answer="PydanticAI agent unavailable. Check pydantic-ai installation.",
            confidence=0.0,
        )
    prompt = _build_prompt(message, history, web_context)
    try:
        result = await agent.run(prompt)  # type: ignore[union-attr]
        return result.data
    except Exception as exc:
        logger.error("PydanticAI agent run failed: %s", exc)
        return ConstructionAnswer(answer=f"Agent error: {exc}", confidence=0.0)
