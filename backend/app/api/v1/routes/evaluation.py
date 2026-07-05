"""
AI Evaluation API — RAGAS + DeepEval.

  POST /ragas     — Evaluate a RAG Q&A pair (faithfulness, relevancy, precision)
  POST /deepeval  — Evaluate an LLM response (relevancy, hallucination)
  POST /batch     — Run both evaluators and return a combined report
  GET  /health    — Check which evaluation libraries are installed

RAGAS metrics (https://docs.ragas.io):
  faithfulness      Is the answer grounded in the retrieved context?
  answer_relevancy  Does the answer actually address the question?
  context_precision Are the retrieved chunks ranked by relevance?

DeepEval metrics (https://docs.confident-ai.com):
  AnswerRelevancyMetric   Semantic similarity to expected/ideal answer
  HallucinationMetric     Factual consistency against provided context

Required packages (all free / open-source):
  ragas
  deepeval
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("civilai.evaluation")
router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────────

class RAGASRequest(BaseModel):
    question:     str
    answer:       str
    contexts:     list[str]
    ground_truth: Optional[str] = None


class DeepEvalRequest(BaseModel):
    input:           str
    actual_output:   str
    expected_output: Optional[str]      = None
    context:         Optional[list[str]] = None


class BatchRequest(BaseModel):
    question:        str
    answer:          str
    contexts:        list[str]
    ground_truth:    Optional[str]      = None
    expected_output: Optional[str]      = None


class EvalResponse(BaseModel):
    scores:  dict
    passed:  bool
    engine:  str
    details: Optional[dict] = None


class BatchResponse(BaseModel):
    ragas:    Optional[EvalResponse] = None
    deepeval: Optional[EvalResponse] = None
    overall:  bool = False


# ── RAGAS ──────────────────────────────────────────────────────────────────────

def _ragas_llm():
    """
    Build a RAGAS-compatible LLM wrapper using Groq (already in stack).
    Falls back to default (OpenAI) if langchain-groq is unavailable.
    """
    try:
        import os
        from ragas.llms import LangchainLLMWrapper
        from langchain_groq import ChatGroq
        return LangchainLLMWrapper(
            ChatGroq(
                model="llama-3.3-70b-versatile",
                groq_api_key=os.getenv("GROQ_API_KEY", ""),
            )
        )
    except Exception:
        return None   # ragas will attempt its default LLM (OpenAI)


@router.post("/ragas", response_model=EvalResponse)
async def evaluate_ragas(body: RAGASRequest):
    """
    Evaluate a RAG Q&A pair with RAGAS using Groq (no OpenAI key needed).

    At minimum supply question, answer, and contexts.
    Optionally add ground_truth to enable context_precision scoring.
    """
    try:
        from datasets import Dataset
        from ragas import evaluate as _eval
        from ragas.metrics import (
            faithfulness,
            answer_relevancy,
            context_precision,
        )

        data: dict = {
            "question": [body.question],
            "answer":   [body.answer],
            "contexts": [body.contexts],
        }
        metrics = [faithfulness, answer_relevancy]

        if body.ground_truth:
            data["ground_truth"] = [body.ground_truth]
            metrics.append(context_precision)

        dataset = Dataset.from_dict(data)
        llm     = _ragas_llm()

        def _run():
            kwargs: dict = {"dataset": dataset, "metrics": metrics}
            if llm is not None:
                kwargs["llm"] = llm
            return _eval(**kwargs)

        result = await asyncio.get_event_loop().run_in_executor(None, _run)

        df   = result.to_pandas()
        skip = {"question", "answer", "contexts", "ground_truth"}
        scores: dict = {}
        for col in df.columns:
            if col in skip:
                continue
            val = df[col].iloc[0]
            try:
                if val == val:   # NaN != NaN
                    scores[col] = round(float(val), 4)
            except Exception:
                pass

        passed = bool(scores) and all(v >= 0.5 for v in scores.values())
        return EvalResponse(scores=scores, passed=passed, engine="ragas")

    except ImportError as exc:
        raise HTTPException(503, f"RAGAS not installed: {exc}")
    except Exception as exc:
        logger.error("RAGAS evaluation failed: %s", exc)
        raise HTTPException(500, f"Evaluation error: {exc}")


# ── DeepEval ───────────────────────────────────────────────────────────────────

def _deepeval_model():
    """
    Return a DeepEval-compatible custom model backed by Groq.
    DeepEval accepts any class with an `a_generate` async method.
    Falls back to None (default OpenAI) if Groq setup fails.
    """
    try:
        import os
        from deepeval.models import DeepEvalBaseLLM
        from langchain_groq import ChatGroq

        class GroqDeepEvalModel(DeepEvalBaseLLM):
            def __init__(self):
                self._llm = ChatGroq(
                    model="llama-3.3-70b-versatile",
                    groq_api_key=os.getenv("GROQ_API_KEY", ""),
                )

            def load_model(self):
                return self._llm

            def generate(self, prompt: str) -> str:
                return self._llm.invoke(prompt).content

            async def a_generate(self, prompt: str) -> str:
                result = await self._llm.ainvoke(prompt)
                return result.content

            def get_model_name(self) -> str:
                return "llama-3.3-70b-versatile"

        return GroqDeepEvalModel()
    except Exception:
        return None  # deepeval will attempt default (OpenAI)


@router.post("/deepeval", response_model=EvalResponse)
async def evaluate_deepeval(body: DeepEvalRequest):
    """
    Evaluate an LLM response with DeepEval using Groq (no OpenAI key needed).

    Measures AnswerRelevancyMetric always; HallucinationMetric when context
    is supplied.
    """
    try:
        from deepeval.test_case import LLMTestCase
        from deepeval.metrics import AnswerRelevancyMetric, HallucinationMetric

        model     = _deepeval_model()
        model_kwarg = {"model": model} if model is not None else {}

        test_case = LLMTestCase(
            input=body.input,
            actual_output=body.actual_output,
            expected_output=body.expected_output,
            context=body.context or [],
        )

        metrics = [AnswerRelevancyMetric(threshold=0.5, **model_kwarg)]
        if body.context:
            metrics.append(HallucinationMetric(threshold=0.5, **model_kwarg))

        scores: dict = {}
        passed_all = True

        for metric in metrics:
            await asyncio.get_event_loop().run_in_executor(
                None, metric.measure, test_case
            )
            name = metric.__class__.__name__
            scores[name] = round(float(metric.score), 4)
            if not metric.is_successful():
                passed_all = False

        return EvalResponse(scores=scores, passed=passed_all, engine="deepeval")

    except ImportError as exc:
        raise HTTPException(503, f"DeepEval not installed: {exc}")
    except Exception as exc:
        logger.error("DeepEval evaluation failed: %s", exc)
        raise HTTPException(500, f"Evaluation error: {exc}")


# ── Batch (RAGAS + DeepEval combined) ─────────────────────────────────────────

@router.post("/batch", response_model=BatchResponse)
async def evaluate_batch(body: BatchRequest):
    """
    Run both RAGAS and DeepEval evaluators concurrently and return a combined
    report with an overall pass/fail verdict (both must pass).

    On ImportError for either library, that evaluator is skipped with null result.
    """
    ragas_req = RAGASRequest(
        question=body.question,
        answer=body.answer,
        contexts=body.contexts,
        ground_truth=body.ground_truth,
    )
    deepeval_req = DeepEvalRequest(
        input=body.question,
        actual_output=body.answer,
        expected_output=body.expected_output,
        context=body.contexts or None,
    )

    async def _safe_ragas() -> Optional[EvalResponse]:
        try:
            return await evaluate_ragas(ragas_req)
        except HTTPException as exc:
            if exc.status_code == 503:
                return None
            raise

    async def _safe_deepeval() -> Optional[EvalResponse]:
        try:
            return await evaluate_deepeval(deepeval_req)
        except HTTPException as exc:
            if exc.status_code == 503:
                return None
            raise

    ragas_result, deepeval_result = await asyncio.gather(
        _safe_ragas(), _safe_deepeval()
    )

    overall = (
        (ragas_result is None or ragas_result.passed) and
        (deepeval_result is None or deepeval_result.passed)
    )

    return BatchResponse(ragas=ragas_result, deepeval=deepeval_result, overall=overall)


# ── Health ─────────────────────────────────────────────────────────────────────

@router.get("/health")
async def eval_health():
    available: dict[str, bool] = {}
    for lib in ("ragas", "deepeval", "datasets"):
        try:
            __import__(lib)
            available[lib] = True
        except ImportError:
            available[lib] = False

    return {
        "status":    "Evaluation API ready",
        "libraries": available,
        "endpoints": ["/ragas", "/deepeval", "/batch"],
    }
