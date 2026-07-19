"""
Unit tests for the LLM-as-judge system (app/ai/hf_judge_client.py,
app/ai/rubrics.py, app/api/v1/routes/judge.py).

All Hugging Face calls are monkeypatched — these run fast, deterministically,
and without a network call or HUGGINGFACE_TOKEN.

Run with: python -m pytest test_judge.py -v
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai import hf_judge_client, rubrics
from app.ai.hf_judge_client import ComparisonVerdict, JudgeVerdict


# ── rubrics ───────────────────────────────────────────────────────────────────

def test_get_rubric_returns_known_rubric():
    r = rubrics.get_rubric("copilot_chat")
    assert r.name == "copilot_chat"
    assert len(r.criteria) > 0


def test_get_rubric_raises_with_available_list_on_unknown():
    with pytest.raises(KeyError) as exc_info:
        rubrics.get_rubric("does_not_exist")
    assert "generic" in str(exc_info.value)  # available list is surfaced


def test_list_rubrics_covers_free_text_and_structured_families():
    names = {r["name"] for r in rubrics.list_rubrics()}
    assert {"copilot_chat", "weekly_report", "letter_email"} <= names        # free-text
    assert {"safety_analysis", "cost_analysis", "compliance_analysis"} <= names  # structured
    assert "generic" in names  # fallback


# ── hf_judge_client.score ──────────────────────────────────────────────────────

_VALID_VERDICT_JSON = json.dumps({
    "overall_score": 7.5,
    "passed": True,
    "criteria": [{"name": "grounding", "score": 8, "reasoning": "Cites specific figures."}],
    "summary": "Solid, grounded response.",
})


def test_score_parses_valid_json(monkeypatch):
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: _VALID_VERDICT_JSON)
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.score(rubric.name, rubric.description, criteria, "some output")

    assert isinstance(verdict, JudgeVerdict)
    assert verdict.overall_score == 7.5
    assert verdict.passed is True
    assert verdict.degraded is False


def test_score_strips_markdown_fences(monkeypatch):
    fenced = f"```json\n{_VALID_VERDICT_JSON}\n```"
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: fenced)
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.score(rubric.name, rubric.description, criteria, "some output")

    assert verdict.overall_score == 7.5


def test_score_returns_degraded_fallback_on_repeated_malformed_json(monkeypatch):
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: "not json at all")
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.score(rubric.name, rubric.description, criteria, "some output", max_retries=1)

    assert verdict.degraded is True
    assert verdict.passed is False


def test_score_skips_model_call_for_empty_output(monkeypatch):
    calls = []
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: calls.append(1) or _VALID_VERDICT_JSON)
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.score(rubric.name, rubric.description, criteria, "   ")

    assert verdict.degraded is True
    assert calls == []  # never called the model


# ── hf_judge_client.compare ─────────────────────────────────────────────────────

_VALID_COMPARISON_JSON = json.dumps({
    "winner": "a",
    "score_a": 8.0,
    "score_b": 5.5,
    "reasoning": "A is more grounded in the supplied data.",
})


def test_compare_parses_valid_json(monkeypatch):
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: _VALID_COMPARISON_JSON)
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.compare(rubric.name, rubric.description, criteria, "output a", "output b")

    assert isinstance(verdict, ComparisonVerdict)
    assert verdict.winner == "a"
    assert verdict.degraded is False


def test_compare_returns_degraded_tie_on_failure(monkeypatch):
    monkeypatch.setattr(hf_judge_client, "_call_judge_model", lambda messages: "garbage")
    rubric = rubrics.get_rubric("generic")
    criteria = [c.model_dump() for c in rubric.criteria]

    verdict = hf_judge_client.compare(rubric.name, rubric.description, criteria, "a", "b", max_retries=0)

    assert verdict.winner == "tie"
    assert verdict.degraded is True


# ── judge route (isolated FastAPI app, no auth middleware) ─────────────────────

@pytest.fixture()
def judge_client(monkeypatch):
    from app.api.v1.routes import judge as judge_route

    def _fake_score(rubric_name, rubric_description, criteria, output, context=None, max_retries=2):
        # Deterministic score derived from output length so batch ordering is predictable
        return JudgeVerdict(
            overall_score=min(10.0, len(output) / 2),
            passed=len(output) > 10,
            criteria=[],
            summary="stub",
        )

    monkeypatch.setattr(judge_route, "judge_score", _fake_score)

    app = FastAPI()
    app.include_router(judge_route.router, prefix="/api/v1/judge")
    return TestClient(app)


def test_rubrics_endpoint(judge_client):
    resp = judge_client.get("/api/v1/judge/rubrics")
    assert resp.status_code == 200
    assert any(r["name"] == "copilot_chat" for r in resp.json()["rubrics"])


def test_score_endpoint_unknown_rubric_returns_404(judge_client):
    resp = judge_client.post("/api/v1/judge/score", json={"rubric": "nope", "output": "hi"})
    assert resp.status_code == 404


def test_score_endpoint_scores_with_stub(judge_client):
    resp = judge_client.post("/api/v1/judge/score", json={"rubric": "generic", "output": "a reasonably long output"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["passed"] is True


def test_batch_endpoint_computes_summary(judge_client):
    items = [
        {"id": "short", "output": "hi"},               # len 2  -> score 1.0, fails
        {"id": "long", "output": "a" * 40},             # len 40 -> score 10.0 (capped), passes
    ]
    resp = judge_client.post("/api/v1/judge/batch", json={"rubric": "generic", "items": items})
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["count"] == 2
    assert body["summary"]["degraded_count"] == 0
    assert body["summary"]["worst"][0]["id"] == "short"  # lowest score sorted first
