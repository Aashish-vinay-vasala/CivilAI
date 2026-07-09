import logging
from typing import Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.material_prices")


class ExtractedMaterialPrice(BaseModel):
    material: str = Field(description="Material name e.g. 'Steel', 'Concrete', 'Lumber'")
    price: float = Field(description="Unit price stated in the document")
    unit: str = Field(default="unit", description="Unit of measure e.g. 'ton', 'm³', 'bf', 'kg'")
    as_of_date: Optional[str] = Field(default=None, description="Date the price is quoted as of, YYYY-MM-DD if stated")
    notes: Optional[str] = Field(default=None, description="Supplier, region, or other context mentioned for this price")


class MaterialPriceList(BaseModel):
    items: list[ExtractedMaterialPrice] = Field(default_factory=list)


def extract_material_prices(text: str) -> list[dict]:
    try:
        result: MaterialPriceList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=MaterialPriceList,
            messages=[{
                "role": "user",
                "content": (
                    "Extract every material price or unit cost quote from this document. "
                    "For each, extract: material name, unit price, unit of measure, the date the price "
                    "is quoted as of (if any), and any supplier/region notes. "
                    "Only include specific priced materials, not summaries or totals.\n\n"
                    f"{text[:6000]}"
                ),
            }],
            max_retries=2,
        )
        return [i.model_dump() for i in result.items]
    except Exception as exc:
        logger.warning("Material price extraction failed: %s", exc)
        return []
