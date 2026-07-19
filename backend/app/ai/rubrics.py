"""
Rubric registry for the LLM-as-judge system (see app/ai/hf_judge_client.py).

Each rubric names a category of AI-generated output in this codebase and a
weighted set of criteria the judge scores it against. Two families are
covered:

  Free-text (no schema validation today — the judge is the only quality
  check):        copilot_chat, agent_copilot_reply, weekly_report,
                 stakeholder_report, risk_report, letter_email

  Structured analyzers (already schema-validated via `instructor`; the judge
  adds a semantic-quality check on top of the shape check):
                 safety_analysis, cost_analysis, compliance_analysis

  Fallback for anything not yet given a dedicated rubric: generic

Adding coverage for the remaining analyzers (contract, equipment, financial
budget, material price, payment, procurement, schedule, support, vendor,
workforce) is just another entry in RUBRICS — same shape as
safety_analysis/cost_analysis/compliance_analysis below.
"""
from pydantic import BaseModel, Field


class Criterion(BaseModel):
    name: str
    description: str
    weight: float = Field(default=1.0, gt=0)


class Rubric(BaseModel):
    name: str
    description: str
    criteria: list[Criterion]


def _c(name: str, description: str, weight: float = 1.0) -> Criterion:
    return Criterion(name=name, description=description, weight=weight)


# ── Free-text outputs ────────────────────────────────────────────────────────

COPILOT_CHAT = Rubric(
    name="copilot_chat",
    description=(
        "A CivilAI Copilot chat response to a construction-management question. "
        "Must follow the bold-heading + bullet format defined in app/ai/copilot.py's "
        "SYSTEM_PROMPT and ground claims in any supplied live project data."
    ),
    criteria=[
        _c("format_compliance", "Uses bold section headings followed by bullet points, no walls of prose.", 0.8),
        _c("grounding", "When live project data was supplied, the response quotes specific values/dates/names from it rather than generic statements. When no data was supplied, it says so and asks for specifics instead of inventing figures.", 1.5),
        _c("domain_accuracy", "Construction/EVM/safety terminology and standards (OSHA, FIDIC, ACI, etc.) are used correctly and appropriately for the question.", 1.2),
        _c("actionability", "Recommendations are specific and actionable (clear owner/deadline/next step), not vague platitudes.", 1.0),
        _c("safety_flagging", "If the query or data touches a safety-critical issue, it is flagged clearly (e.g. under a Safety Alert heading) rather than buried.", 1.0),
    ],
)

AGENT_COPILOT_REPLY = Rubric(
    name="agent_copilot_reply",
    description=(
        "A reply from the agentic tool-calling copilot (app/ai/agent_copilot.py), which "
        "may have called one or more tools before answering."
    ),
    criteria=[
        _c("tool_use_appropriateness", "Tools were called when needed to answer accurately (not skipped when data lookup was clearly required, not called gratuitously when unnecessary).", 1.3),
        _c("grounding", "The final reply is consistent with what the tool results actually returned — no fabricated numbers or entities not present in tool output.", 1.5),
        _c("completeness", "The reply fully addresses the user's question rather than a partial or tangential answer.", 1.0),
        _c("clarity", "The reply is clearly written and appropriately concise for the audience (project directors/engineers).", 0.8),
    ],
)

WEEKLY_REPORT = Rubric(
    name="weekly_report",
    description="A generated weekly project status report (app/ai/report_generator.py: generate_weekly_report).",
    criteria=[
        _c("data_grounding", "Figures, dates, and statuses cited are consistent with the underlying project data provided, not invented.", 1.5),
        _c("structure", "Report is organized into clear sections appropriate for a weekly status update (progress, risks/issues, upcoming work, metrics).", 1.0),
        _c("completeness", "Covers schedule, cost, and safety/quality status where relevant data exists — doesn't silently omit a dimension that had notable data.", 1.2),
        _c("actionability", "Issues/risks identified come with a clear next step or owner, not just a bare observation.", 1.0),
        _c("tone", "Professional tone appropriate for stakeholders; no hedging filler or AI-generic phrasing.", 0.6),
    ],
)

STAKEHOLDER_REPORT = Rubric(
    name="stakeholder_report",
    description="A generated stakeholder-facing report (app/ai/report_generator.py: generate_stakeholder_report).",
    criteria=[
        _c("data_grounding", "Figures and statuses match the underlying project data, not invented.", 1.5),
        _c("audience_fit", "Framed for a non-technical stakeholder audience — avoids unexplained jargon, leads with business impact.", 1.2),
        _c("completeness", "Addresses budget, schedule, and major risks at a level of detail appropriate for stakeholders (not overly granular, not vague).", 1.0),
        _c("clarity", "Clear, well-organized, and free of internal construction-management shorthand that a stakeholder wouldn't recognize.", 1.0),
    ],
)

RISK_REPORT = Rubric(
    name="risk_report",
    description="A generated project risk report (app/ai/report_generator.py: generate_risk_report).",
    criteria=[
        _c("risk_identification", "Identifies risks that are actually supported by the underlying data, not generic boilerplate risks.", 1.5),
        _c("prioritization", "Risks are prioritized/ranked by severity or likelihood rather than presented as an undifferentiated list.", 1.0),
        _c("mitigation_quality", "Each significant risk has a concrete, actionable mitigation, not a vague 'monitor closely'.", 1.3),
        _c("data_grounding", "Cites specific data points (dates, cost variances, incident counts) rather than unsupported assertions.", 1.2),
    ],
)

LETTER_EMAIL = Rubric(
    name="letter_email",
    description="A generated professional letter or email (app/ai/writing_assistant.py).",
    criteria=[
        _c("tone_appropriateness", "Tone and formality match a professional construction-industry letter/email for its stated purpose.", 1.2),
        _c("factual_grounding", "Any facts, dates, amounts, or names referenced are consistent with the input request, not fabricated.", 1.5),
        _c("completeness", "Covers what was requested (purpose stated, necessary details included, clear call to action if applicable).", 1.0),
        _c("clarity", "Well-structured and free of ambiguity; a recipient would know exactly what is being asked/stated.", 1.0),
    ],
)

# ── Structured analyzer outputs (semantic layer on top of schema validation) ──

SAFETY_ANALYSIS = Rubric(
    name="safety_analysis",
    description=(
        "The narrative + extracted SafetyRisk from app/ai/safety_analyzer.py "
        "(analyze_safety_report). Schema validity is already guaranteed by "
        "`instructor`; this rubric checks whether the content is actually sound."
    ),
    criteria=[
        _c("risk_score_justification", "The numeric risk_score/risk_level is consistent with the violations and narrative described, not arbitrary.", 1.5),
        _c("violation_specificity", "Violations listed are specific (what, where) rather than generic ('safety issues found').", 1.2),
        _c("osha_relevance", "OSHA compliance findings and corrective actions reference plausible, relevant standards for the described situation.", 1.0),
        _c("actionability", "Immediate actions are concrete and prioritized by urgency.", 1.0),
    ],
)

COST_ANALYSIS = Rubric(
    name="cost_analysis",
    description="The narrative + extracted CostRisk from app/ai/cost_analyzer.py.",
    criteria=[
        _c("numeric_consistency", "Cost figures, variances, and risk scores in the narrative are internally consistent with each other (no contradictions).", 1.5),
        _c("driver_identification", "Cost overrun drivers/risks identified are specific to the data provided, not generic industry boilerplate.", 1.3),
        _c("actionability", "Recommendations tie back to the specific drivers identified, with a plausible mitigation path.", 1.0),
    ],
)

COMPLIANCE_ANALYSIS = Rubric(
    name="compliance_analysis",
    description="The narrative + extracted ComplianceRisk from app/ai/compliance_analyzer.py.",
    criteria=[
        _c("regulatory_accuracy", "Cited codes/standards/permit requirements are plausible and relevant to the jurisdiction/project type implied by the data.", 1.5),
        _c("gap_specificity", "Compliance gaps identified are specific and traceable to something in the source data, not generic.", 1.2),
        _c("actionability", "Corrective actions and deadlines are concrete and realistic.", 1.0),
    ],
)

GENERIC = Rubric(
    name="generic",
    description=(
        "Fallback rubric for AI output types without a dedicated rubric yet. "
        "Covers baseline quality dimensions that apply to almost any generated "
        "construction-management content."
    ),
    criteria=[
        _c("grounding", "Claims, figures, and entities are consistent with any supplied context — nothing appears fabricated.", 1.5),
        _c("relevance", "Directly addresses what was asked/requested, without significant tangents.", 1.0),
        _c("clarity", "Well-organized and clearly written for a construction-management professional audience.", 0.8),
        _c("actionability", "Where recommendations or next steps are appropriate, they are specific rather than vague.", 1.0),
    ],
)


RUBRICS: dict[str, Rubric] = {
    r.name: r for r in [
        COPILOT_CHAT, AGENT_COPILOT_REPLY, WEEKLY_REPORT, STAKEHOLDER_REPORT,
        RISK_REPORT, LETTER_EMAIL, SAFETY_ANALYSIS, COST_ANALYSIS,
        COMPLIANCE_ANALYSIS, GENERIC,
    ]
}


def get_rubric(name: str) -> Rubric:
    try:
        return RUBRICS[name]
    except KeyError:
        available = ", ".join(sorted(RUBRICS))
        raise KeyError(f"Unknown rubric '{name}'. Available: {available}") from None


def list_rubrics() -> list[dict]:
    return [
        {"name": r.name, "description": r.description, "criteria_count": len(r.criteria)}
        for r in RUBRICS.values()
    ]
