"""
Tests for the agent-reply grounding check (app/core/grounding.py) and its
HITL routing (app/core/hitl.py: check_agent_reply).

Two tiers:
  1. Deterministic unit tests — the Groq client and Supabase insert are
     monkeypatched, so these run fast without network access or credentials
     (same convention as test_judge.py / test_guardrails.py).
  2. Golden-set regression (integration tier, class TestGoldenSetRegression) —
     runs check_grounding() and DeepEval's HallucinationMetric against real
     Groq calls over a small fixed set of known grounded/ungrounded
     reply + tool-output pairs, so a prompt or model swap can't silently
     regress grounding detection. Requires GROQ_API_KEY and network access,
     so it's skipped unless RUN_INTEGRATION_EVALS=1 is set.

Run with:
    python -m pytest test_grounding_eval.py -v
Run including the golden set:
    RUN_INTEGRATION_EVALS=1 python -m pytest test_grounding_eval.py -v
"""
import os
import types

import pytest

from app.core import grounding, hitl


# ── check_grounding — deterministic ──────────────────────────────────────────

def _fake_completion(content: str):
    """Minimal stand-in for the object groq_client.chat.completions.create()
    returns — only the .choices[0].message.content path is used."""
    msg = types.SimpleNamespace(content=content)
    choice = types.SimpleNamespace(message=msg)
    return types.SimpleNamespace(choices=[choice])


class _FakeGroqClient:
    """Replaces app.core.grounding's module-level `groq_client` name so tests
    never touch the real Groq proxy/credentials."""

    def __init__(self, content: str = "", raise_error: bool = False):
        self._content = content
        self._raise_error = raise_error
        self.chat = types.SimpleNamespace(
            completions=types.SimpleNamespace(create=self._create)
        )

    def _create(self, **kwargs):
        if self._raise_error:
            raise RuntimeError("groq unavailable")
        return _fake_completion(self._content)


@pytest.mark.asyncio
async def test_check_grounding_skips_when_no_tools_called():
    is_grounded, reason = await grounding.check_grounding("Some reply", [])
    assert is_grounded is True
    assert reason == "no_tools_called"


@pytest.mark.asyncio
async def test_check_grounding_skips_when_tool_output_empty():
    is_grounded, reason = await grounding.check_grounding(
        "Some reply", [{"tool": "analyze_cost_data", "output": ""}]
    )
    assert is_grounded is True
    assert reason == "empty_tool_output"


@pytest.mark.asyncio
async def test_check_grounding_passes_grounded_reply(monkeypatch):
    monkeypatch.setattr(grounding, "groq_client", _FakeGroqClient("GROUNDED"))
    is_grounded, _reason = await grounding.check_grounding(
        "CPI is 0.92, slightly under budget.",
        [{"tool": "analyze_cost_data", "output": "CPI: 0.92"}],
    )
    assert is_grounded is True


@pytest.mark.asyncio
async def test_check_grounding_flags_ungrounded_reply(monkeypatch):
    monkeypatch.setattr(grounding, "groq_client", _FakeGroqClient("UNGROUNDED"))
    is_grounded, reason = await grounding.check_grounding(
        "CPI is 1.5, well ahead of budget.",
        [{"tool": "analyze_cost_data", "output": "CPI: 0.92"}],
    )
    assert is_grounded is False
    assert "not supported" in reason


@pytest.mark.asyncio
async def test_check_grounding_fails_open_on_error(monkeypatch):
    monkeypatch.setattr(grounding, "groq_client", _FakeGroqClient(raise_error=True))
    is_grounded, reason = await grounding.check_grounding(
        "Some reply", [{"tool": "analyze_cost_data", "output": "CPI: 0.92"}],
    )
    assert is_grounded is True
    assert reason == "check_unavailable"


# ── hitl.check_agent_reply — deterministic ───────────────────────────────────

class _FakeSupabaseTable:
    def __init__(self, store: list):
        self._store = store
        self._pending: dict | None = None

    def insert(self, record: dict):
        self._pending = record
        return self

    def execute(self):
        record = dict(self._pending)
        record["id"] = f"fake-{len(self._store) + 1}"
        self._store.append(record)
        return types.SimpleNamespace(data=[record])


class _FakeSupabase:
    def __init__(self):
        self.inserted: list = []

    def table(self, name: str):
        assert name == "ai_review_queue"
        return _FakeSupabaseTable(self.inserted)


def test_check_agent_reply_queues_with_expected_shape(monkeypatch):
    fake_sb = _FakeSupabase()
    monkeypatch.setattr(hitl, "supabase", fake_sb)

    requires_review, review_id, reason = hitl.check_agent_reply(
        reply="CPI is 1.4, well ahead of budget.",
        grounding_reason="Reply contains claims not supported by tool output",
        tool_steps=[{"tool": "analyze_cost_data", "output": "CPI: 0.92"}],
        session_id="sess-123",
        project_id="proj-456",
    )

    assert requires_review is True
    assert review_id == fake_sb.inserted[0]["id"]
    assert "grounding check" in reason

    queued = fake_sb.inserted[0]
    assert queued["route"] == "agent/chat"
    assert queued["project_id"] == "proj-456"
    assert queued["risk_score"] == 6.0
    assert "analyze_cost_data" in queued["trigger_reason"]


def test_check_agent_reply_handles_no_project_id(monkeypatch):
    fake_sb = _FakeSupabase()
    monkeypatch.setattr(hitl, "supabase", fake_sb)

    requires_review, review_id, _reason = hitl.check_agent_reply(
        reply="Some ungrounded reply",
        grounding_reason="check_unavailable",
        tool_steps=[],
        session_id="sess-999",
        project_id=None,
    )

    assert requires_review is True
    assert review_id is not None
    assert fake_sb.inserted[0]["project_id"] is None


# ── Golden-set regression — live Groq/DeepEval calls, opt-in only ────────────

GOLDEN_SET = [
    {
        "id": "cost_grounded",
        "reply": (
            "The project is running at a CPI of 0.92 and an SPI of 0.87, both "
            "below 1.0, indicating cost and schedule underperformance."
        ),
        "tool_output": (
            "CPI: 0.92\nSPI: 0.87\nBudget: $2,400,000\nActual Cost: $1,150,000"
        ),
        "expect_grounded": True,
    },
    {
        "id": "safety_grounded",
        "reply": (
            "There are 3 open safety incidents, including one high-severity "
            "fall at Zone B reported on 2026-07-15."
        ),
        "tool_output": (
            "Incidents: 3 open\n"
            "1. Fall, Zone B, 2026-07-15, severity: high\n"
            "2. Slip, Zone A, 2026-07-10, severity: low\n"
            "3. Near-miss, Zone C, 2026-07-20, severity: low"
        ),
        "expect_grounded": True,
    },
    {
        "id": "cost_fabricated_number",
        "reply": (
            "The project is running at a CPI of 1.4, well ahead of budget, "
            "with a projected surplus of $500,000."
        ),
        "tool_output": (
            "CPI: 0.92\nSPI: 0.87\nBudget: $2,400,000\nActual Cost: $1,150,000"
        ),
        "expect_grounded": False,
    },
    {
        "id": "safety_fabricated_incident",
        "reply": (
            "There have been 12 safety incidents this month, including 2 "
            "fatalities, requiring an immediate OSHA site shutdown."
        ),
        "tool_output": (
            "Incidents: 3 open\n"
            "1. Fall, Zone B, 2026-07-15, severity: high\n"
            "2. Slip, Zone A, 2026-07-10, severity: low\n"
            "3. Near-miss, Zone C, 2026-07-20, severity: low"
        ),
        "expect_grounded": False,
    },
]

_RUN_INTEGRATION = os.getenv("RUN_INTEGRATION_EVALS") == "1"


@pytest.mark.skipif(
    not _RUN_INTEGRATION,
    reason="Live Groq/DeepEval calls — set RUN_INTEGRATION_EVALS=1 to run",
)
class TestGoldenSetRegression:
    """
    Requires GROQ_API_KEY and network access. Not run by default because these
    are live LLM calls — slower, and accuracy (not the assertions themselves)
    can drift at the margins as models change. That drift is exactly what this
    is meant to catch: run it after touching the grounding prompt, the agent's
    system prompt, or the underlying model.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scenario", GOLDEN_SET, ids=[s["id"] for s in GOLDEN_SET])
    async def test_grounding_classifier_matches_expected(self, scenario):
        tool_steps = [{"tool": "test_tool", "output": scenario["tool_output"]}]
        is_grounded, _reason = await grounding.check_grounding(scenario["reply"], tool_steps)
        assert is_grounded == scenario["expect_grounded"], (
            f"Scenario '{scenario['id']}' expected grounded={scenario['expect_grounded']} "
            f"but the classifier returned {is_grounded}"
        )

    def test_deepeval_hallucination_metric_on_golden_set(self):
        from deepeval.test_case import LLMTestCase
        from deepeval.metrics import HallucinationMetric
        from app.api.v1.routes.evaluation import _deepeval_model

        model = _deepeval_model()
        model_kwarg = {"model": model} if model is not None else {}
        metric = HallucinationMetric(threshold=0.5, **model_kwarg)

        failures = []
        for scenario in GOLDEN_SET:
            test_case = LLMTestCase(
                input=f"Report on scenario {scenario['id']}",
                actual_output=scenario["reply"],
                context=[scenario["tool_output"]],
            )
            metric.measure(test_case)
            passed = metric.is_successful()
            if passed != scenario["expect_grounded"]:
                failures.append(
                    f"{scenario['id']}: expected grounded={scenario['expect_grounded']}, "
                    f"got {passed} (score={metric.score:.2f})"
                )

        assert not failures, "DeepEval HallucinationMetric mismatched golden set:\n" + "\n".join(failures)
