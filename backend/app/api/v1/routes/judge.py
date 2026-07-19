"""
LLM-as-judge API — Hugging Face judge model scoring CivilAI's AI-generated
output (Copilot chat, generated reports/letters, and the structured
analyzers) against named rubrics (app/ai/rubrics.py).

  GET  /rubrics  — list available rubrics and their criteria count
  GET  /health   — confirm the HF judge is configured
  POST /score    — score a single output against a rubric
  POST /compare  — A/B compare two outputs against the same rubric
  POST /batch    — score many outputs at once; returns per-item verdicts +
                   summary stats (avg score, pass rate, worst performers)

This is a separate router from evaluation.py (RAGAS/DeepEval via Groq) —
that endpoint judges RAG faithfulness/relevancy; this one judges CivilAI's
own domain-specific output quality against hand-written rubrics, using a
different model family (Qwen via Hugging Face) than the Groq/Llama
generator to avoid same-family self-preference bias.
"""
import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai import rubrics as rubrics_module
from app.ai.hf_judge_client import (
    ComparisonVerdict,
    JudgeVerdict,
    compare as judge_compare,
    get_judge_model,
    score as judge_score,
)
from app.config import settings

logger = logging.getLogger("civilai.judge_api")
router = APIRouter()

# Cap concurrent HF calls in a batch — the free Inference Providers tier
# rate-limits aggressively; unbounded gather() would just trade retries for
# a wall of 429s.
_BATCH_CONCURRENCY = 4


# ── Request / Response models ────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    rubric: str = Field(description="Rubric name — see GET /rubrics")
    output: str = Field(description="The AI-generated text to judge")
    context: str | None = Field(default=None, description="Source data/context the output should be grounded in")


class CompareRequest(BaseModel):
    rubric: str
    output_a: str
    output_b: str
    context: str | None = None


class BatchItem(BaseModel):
    id: str
    output: str
    context: str | None = None


class BatchRequest(BaseModel):
    rubric: str
    items: list[BatchItem] = Field(min_length=1, max_length=100)


class BatchResultItem(BaseModel):
    id: str
    verdict: JudgeVerdict


class BatchSummary(BaseModel):
    count: int
    avg_score: float
    pass_rate: float
    degraded_count: int
    worst: list[BatchResultItem]


class BatchResponse(BaseModel):
    rubric: str
    results: list[BatchResultItem]
    summary: BatchSummary


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/rubrics")
async def list_rubrics():
    return {"rubrics": rubrics_module.list_rubrics()}


@router.get("/health")
async def judge_health():
    return {
        "status": "LLM Judge API ready",
        "judge_model": get_judge_model(),
        "hf_token_configured": bool(settings.HUGGINGFACE_TOKEN),
        "rubric_count": len(rubrics_module.RUBRICS),
    }


@router.post("/score", response_model=JudgeVerdict)
async def score_output(body: ScoreRequest):
    try:
        rubric = rubrics_module.get_rubric(body.rubric)
    except KeyError as exc:
        raise HTTPException(404, str(exc))

    criteria = [c.model_dump() for c in rubric.criteria]
    return await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: judge_score(rubric.name, rubric.description, criteria, body.output, body.context),
    )


@router.post("/compare", response_model=ComparisonVerdict)
async def compare_outputs(body: CompareRequest):
    try:
        rubric = rubrics_module.get_rubric(body.rubric)
    except KeyError as exc:
        raise HTTPException(404, str(exc))

    criteria = [c.model_dump() for c in rubric.criteria]
    return await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: judge_compare(
            rubric.name, rubric.description, criteria,
            body.output_a, body.output_b, body.context,
        ),
    )


@router.post("/batch", response_model=BatchResponse)
async def batch_score(body: BatchRequest):
    try:
        rubric = rubrics_module.get_rubric(body.rubric)
    except KeyError as exc:
        raise HTTPException(404, str(exc))

    criteria = [c.model_dump() for c in rubric.criteria]
    semaphore = asyncio.Semaphore(_BATCH_CONCURRENCY)
    loop = asyncio.get_event_loop()

    async def _score_one(item: BatchItem) -> BatchResultItem:
        async with semaphore:
            verdict = await loop.run_in_executor(
                None,
                lambda: judge_score(rubric.name, rubric.description, criteria, item.output, item.context),
            )
            return BatchResultItem(id=item.id, verdict=verdict)

    results = await asyncio.gather(*(_score_one(item) for item in body.items))
    results = list(results)

    scored = [r for r in results if not r.verdict.degraded]
    degraded_count = len(results) - len(scored)
    avg_score = round(sum(r.verdict.overall_score for r in scored) / len(scored), 2) if scored else 0.0
    pass_rate = round(sum(1 for r in scored if r.verdict.passed) / len(scored), 4) if scored else 0.0
    worst = sorted(scored, key=lambda r: r.verdict.overall_score)[:5]

    summary = BatchSummary(
        count=len(results),
        avg_score=avg_score,
        pass_rate=pass_rate,
        degraded_count=degraded_count,
        worst=worst,
    )
    return BatchResponse(rubric=rubric.name, results=results, summary=summary)
