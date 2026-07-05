import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.schedule")

SCHEDULE_PROMPT = """
You are an expert construction schedule analyst.
Analyze and provide:

1. **Delay Analysis**
   - Current delays
   - Root causes
   - Critical path impact

2. **Schedule Assessment**
   - Tasks at risk
   - Resource conflicts
   - Weather impacts

3. **Recovery Plan**
   - Recommended actions
   - Resource reallocation
   - Timeline adjustments

4. **Risk Forecast**
   - Upcoming delay risks
   - Mitigation strategies
   - Contingency recommendations

Be specific with dates and durations.
"""


class ScheduleRisk(BaseModel):
    delay_days: int = Field(ge=0, default=0)
    risk_level: Literal["Low", "Medium", "High"]
    completion_probability: str = Field(description="Probability as percentage string, e.g. '75%'")
    critical_tasks: list[str] = Field(default_factory=list)
    delay_causes: list[str] = Field(default_factory=list)
    recovery_time_days: int = Field(ge=0, default=0)


class ExtractedTask(BaseModel):
    task_name: str = Field(description="Name of the task or activity")
    phase: Optional[str] = Field(default=None, description="Project phase or work package, e.g. 'Foundation', 'Structure'")
    assignee: Optional[str] = Field(default=None, description="Assigned person, team, or subcontractor if mentioned")
    planned_start: Optional[str] = Field(default=None, description="Planned start date in YYYY-MM-DD format, else null")
    planned_end: Optional[str] = Field(default=None, description="Planned end/completion date in YYYY-MM-DD format, else null")
    status: Literal["pending", "inprogress", "delayed", "done"] = "pending"
    priority: Literal["low", "medium", "high"] = "medium"
    planned_progress: int = Field(default=100, ge=0, le=100, description="Target completion percentage, usually 100")
    actual_progress: int = Field(default=0, ge=0, le=100, description="Current actual progress percentage if mentioned")
    delay_days: int = Field(default=0, ge=0, description="Number of delay days if mentioned, else 0")


class TasksList(BaseModel):
    tasks: list[ExtractedTask] = Field(default_factory=list)


def analyze_schedule(text: str) -> dict:
    analysis = analyze_document(text, SCHEDULE_PROMPT)
    try:
        risk: ScheduleRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=ScheduleRisk,
            messages=[{"role": "user", "content": f"Extract schedule risk metrics from this project schedule:\n{text[:3000]}"}],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Schedule risk extraction failed: %s", exc)
        risk_data = {"delay_days": 0, "risk_level": "Medium", "completion_probability": "Unknown",
                     "critical_tasks": [], "delay_causes": [], "recovery_time_days": 0}

    try:
        tasks_list: TasksList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=TasksList,
            messages=[{"role": "user", "content": f"Extract every task, activity, or work item mentioned in this schedule document as structured data. Use null for any date not explicitly mentioned:\n{text[:4000]}"}],
            max_retries=2,
        )
        extracted_tasks = [t.model_dump() for t in tasks_list.tasks]
    except Exception as exc:
        logger.warning("Task extraction failed: %s", exc)
        extracted_tasks = []

    return {"analysis": analysis, "risk_data": risk_data, "extracted_tasks": extracted_tasks}


def predict_delays(project_data: dict) -> str:
    prompt = f"""
    Predict delays for this construction project:
    {project_data}

    Include:
    - Predicted delay duration
    - High risk tasks
    - Weather impact analysis
    - Resource bottlenecks
    - Recovery recommendations
    """
    return analyze_document(str(project_data), prompt)


def what_if_analysis(scenario: dict) -> str:
    prompt = f"""
    Perform what-if analysis for this scenario:
    {scenario}

    Include:
    - Impact on timeline
    - Cost implications
    - Resource requirements
    - Risk assessment
    - Recommended response
    """
    return analyze_document(str(scenario), prompt)


def generate_recovery_plan(delay_data: dict) -> str:
    prompt = f"""
    Generate a recovery plan for this delay:
    {delay_data}

    Include:
    - Immediate actions
    - Resource reallocation
    - Revised milestones
    - Cost to recover
    - Success probability
    """
    return analyze_document(str(delay_data), prompt)
