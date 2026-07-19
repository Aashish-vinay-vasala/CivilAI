"""
LLM-as-judge client — Hugging Face Inference Providers backend.

Judges free-form or structured AI output against a named rubric (see
app/ai/rubrics.py) and returns a typed verdict: per-criterion scores,
an overall score, and a pass/fail call.

Deliberately uses a different model family (Qwen) than the primary
generator (Groq's Llama-3.3-70B) to avoid same-family self-preference bias
that RAGAS/DeepEval's ChatGroq judge in evaluation.py is exposed to.

Required env var: HUGGINGFACE_TOKEN (already in app/config.py).
Optional env var: JUDGE_HF_MODEL (override the judge model).
"""
import json
import logging
import re
from typing import Literal, Optional

from huggingface_hub import InferenceClient
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger("civilai.judge")

_DEFAULT_MODEL = "Qwen/Qwen2.5-72B-Instruct"
_JUDGE_MODEL = getattr(settings, "JUDGE_HF_MODEL", None) or _DEFAULT_MODEL

_client = InferenceClient(token=settings.HUGGINGFACE_TOKEN)


# ── Result models ────────────────────────────────────────────────────────────

class CriterionScore(BaseModel):
    name: str
    score: float = Field(ge=0, le=10)
    reasoning: str


class JudgeVerdict(BaseModel):
    overall_score: float = Field(ge=0, le=10)
    passed: bool
    criteria: list[CriterionScore] = Field(default_factory=list)
    summary: str
    degraded: bool = Field(
        default=False,
        description="True when the judge call failed and this is a safe fallback verdict.",
    )


class ComparisonVerdict(BaseModel):
    winner: Literal["a", "b", "tie"]
    score_a: float = Field(ge=0, le=10)
    score_b: float = Field(ge=0, le=10)
    reasoning: str
    degraded: bool = False


# ── Prompt construction ──────────────────────────────────────────────────────

def _criteria_block(criteria: list[dict]) -> str:
    lines = []
    for c in criteria:
        weight_note = f" (weight: {c['weight']})" if c.get("weight") else ""
        lines.append(f"- **{c['name']}**{weight_note}: {c['description']}")
    return "\n".join(lines)


def _score_system_prompt() -> str:
    return (
        "You are a strict, impartial evaluator of AI-generated construction-management "
        "content. You are independent of the system that produced the output — do not give "
        "credit for effort or confident tone; grade only against the stated criteria and "
        "supporting context. Respond with ONLY a single JSON object, no markdown fences, "
        "no commentary before or after it."
    )


def _build_score_prompt(rubric_name: str, rubric_description: str, criteria: list[dict],
                         output: str, context: Optional[str]) -> list[dict]:
    context_block = f"\n\nSupporting context / source data:\n{context[:4000]}" if context else ""
    user = f"""Rubric: {rubric_name}
{rubric_description}

Criteria:
{_criteria_block(criteria)}

Output to evaluate:
{output[:6000]}
{context_block}

Score each criterion from 0-10 (10 = fully meets the criterion, 0 = fails it entirely).
Return JSON exactly matching this shape:
{{
  "overall_score": <weighted average, 0-10, one decimal>,
  "passed": <true if overall_score >= 6.0 and no criterion scores below 3, else false>,
  "criteria": [
    {{"name": "<criterion name>", "score": <0-10>, "reasoning": "<one sentence>"}}
  ],
  "summary": "<2-3 sentence overall assessment>"
}}"""
    return [
        {"role": "system", "content": _score_system_prompt()},
        {"role": "user", "content": user},
    ]


def _build_compare_prompt(rubric_name: str, rubric_description: str, criteria: list[dict],
                           output_a: str, output_b: str, context: Optional[str]) -> list[dict]:
    context_block = f"\n\nSupporting context / source data:\n{context[:4000]}" if context else ""
    user = f"""Rubric: {rubric_name}
{rubric_description}

Criteria:
{_criteria_block(criteria)}

Output A:
{output_a[:4000]}

Output B:
{output_b[:4000]}
{context_block}

Compare A and B against the criteria above. Score each 0-10 and pick a winner.
Return JSON exactly matching this shape:
{{
  "winner": "a" | "b" | "tie",
  "score_a": <0-10>,
  "score_b": <0-10>,
  "reasoning": "<2-3 sentences citing specific criteria that decided it>"
}}"""
    return [
        {"role": "system", "content": _score_system_prompt()},
        {"role": "user", "content": user},
    ]


# ── JSON extraction ──────────────────────────────────────────────────────────

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _extract_json(text: str) -> dict:
    """Strip markdown fences / stray prose and parse the first JSON object found."""
    fenced = _FENCE_RE.search(text)
    candidate = fenced.group(1) if fenced else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"No JSON object found in judge response: {text[:200]!r}")
    return json.loads(candidate[start:end + 1])


# ── Core calls ────────────────────────────────────────────────────────────────

def _call_judge_model(messages: list[dict]) -> str:
    response = _client.chat.completions.create(
        model=_JUDGE_MODEL,
        messages=messages,
        max_tokens=1024,
        temperature=0.0,
    )
    return response.choices[0].message.content


def _fallback_verdict(reason: str) -> JudgeVerdict:
    logger.warning("Judge call failed, returning degraded fallback verdict: %s", reason)
    return JudgeVerdict(
        overall_score=0.0,
        passed=False,
        criteria=[],
        summary=f"Judge unavailable: {reason}",
        degraded=True,
    )


def score(rubric_name: str, rubric_description: str, criteria: list[dict],
          output: str, context: Optional[str] = None, max_retries: int = 2) -> JudgeVerdict:
    """Score a single AI output against a rubric's criteria."""
    if not output or not output.strip():
        return _fallback_verdict("empty output provided — nothing to judge")

    messages = _build_score_prompt(rubric_name, rubric_description, criteria, output, context)
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = _call_judge_model(messages)
            parsed = _extract_json(raw)
            return JudgeVerdict(**parsed)
        except Exception as exc:  # noqa: BLE001 - defensive: judge must never crash a caller
            last_exc = exc
            logger.warning("Judge score attempt %d/%d failed: %s", attempt + 1, max_retries + 1, exc)
    return _fallback_verdict(str(last_exc))


def compare(rubric_name: str, rubric_description: str, criteria: list[dict],
            output_a: str, output_b: str, context: Optional[str] = None,
            max_retries: int = 2) -> ComparisonVerdict:
    """A/B compare two outputs against the same rubric."""
    messages = _build_compare_prompt(rubric_name, rubric_description, criteria,
                                      output_a, output_b, context)
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = _call_judge_model(messages)
            parsed = _extract_json(raw)
            return ComparisonVerdict(**parsed)
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("Judge compare attempt %d/%d failed: %s", attempt + 1, max_retries + 1, exc)
    logger.warning("Judge compare failed, returning degraded tie: %s", last_exc)
    return ComparisonVerdict(
        winner="tie", score_a=0.0, score_b=0.0,
        reasoning=f"Judge unavailable: {last_exc}", degraded=True,
    )


def get_judge_model() -> str:
    return _JUDGE_MODEL
