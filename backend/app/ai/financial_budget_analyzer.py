import logging
from pydantic import BaseModel, Field
from app.ai.groq_client import instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.financial_budget")


class ExtractedBudgetItem(BaseModel):
    code: str = Field(default="")
    description: str
    div_code: str = Field(default="00")
    div_name: str = Field(default="Uncategorized")
    original_budget: float = Field(default=0.0)
    budget_mods: float = Field(default=0.0)
    approved_cos: float = Field(default=0.0)
    revised_budget: float = Field(default=0.0)
    pending_changes: float = Field(default=0.0)
    projected_budget: float = Field(default=0.0)
    committed_costs: float = Field(default=0.0)
    direct_costs: float = Field(default=0.0)


class BudgetItemList(BaseModel):
    items: list[ExtractedBudgetItem] = Field(default_factory=list)


def extract_budget_items(text: str) -> list[dict]:
    """AI extraction of budget line items from any document text."""
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=BudgetItemList,
            messages=[{"role": "user", "content": (
                "Extract all budget line items from this construction budget document. "
                "For each item extract: code (cost code or line number), description, "
                "div_code (2-digit CSI division, e.g. '03' for Concrete, '26' for Electrical), "
                "div_name (division name), original_budget (initial approved amount), "
                "budget_mods (adjustments not from COs), approved_cos (approved change orders), "
                "revised_budget (original + mods + COs), pending_changes (unapproved COs), "
                "projected_budget (revised + pending), committed_costs (subcontract obligations), "
                "direct_costs (actual spend / invoiced). "
                "Use 0.0 for missing numeric fields. "
                "Auto-compute: revised_budget = original_budget + budget_mods + approved_cos. "
                "Auto-compute: projected_budget = revised_budget + pending_changes.\n\n"
                f"{text[:6000]}"
            )}],
            max_retries=2,
        )
        items = []
        for idx, item in enumerate(result.items):
            d = item.model_dump()
            if not d.get("code"):
                d["code"] = str(idx + 1).zfill(4)
            if d.get("revised_budget", 0) == 0 and d.get("original_budget", 0) > 0:
                d["revised_budget"] = (
                    d["original_budget"]
                    + d.get("budget_mods", 0)
                    + d.get("approved_cos", 0)
                )
            if d.get("projected_budget", 0) == 0:
                d["projected_budget"] = (
                    d.get("revised_budget", 0) + d.get("pending_changes", 0)
                )
            items.append(d)
        return items
    except Exception as exc:
        logger.warning("Budget AI extraction failed: %s", exc)
        return []
