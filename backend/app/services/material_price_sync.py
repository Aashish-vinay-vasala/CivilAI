import logging
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger("civilai.material_price_sync")

# FRED (Federal Reserve Economic Data) series for each tracked material — free API,
# no signup cost, real US producer-price-index data. Kept as a plain dict so more
# materials/series (or a different provider entirely) can be added without touching
# the sync logic below.
FRED_SERIES: dict[str, dict[str, str]] = {
    "Lumber":   {"series_id": "WPU081",           "unit": "index"},
    "Steel":    {"series_id": "WPU101707",        "unit": "index"},
    "Concrete": {"series_id": "WPU1333",           "unit": "index"},
    "Asphalt":  {"series_id": "WPU058",           "unit": "index"},
}

_FRED_URL = "https://api.stlouisfed.org/fred/series/observations"

# change_pct column is numeric(12,2) — cap well inside that. FRED returns index-point
# values, which can be on a wildly different scale than an old manual $/unit entry for
# the same material, producing a huge (and otherwise overflow-prone) computed swing.
_MAX_CHANGE_PCT = 999_999.99


def _get_supabase():
    from supabase import create_client
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


async def fetch_fred_latest(series_id: str) -> dict | None:
    """Fetch the most recent observation for a FRED series. Returns None on any failure
    (missing key, network error, series with no recent data) rather than raising —
    callers should treat a material as "not updated this cycle" instead of crashing
    the whole sync over one bad series."""
    if not settings.FRED_API_KEY:
        return None
    params = {
        "series_id": series_id,
        "api_key": settings.FRED_API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_FRED_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        obs = (data.get("observations") or [None])[0]
        if not obs or obs.get("value") in (None, "."):
            return None
        return {"value": float(obs["value"]), "date": obs.get("date")}
    except Exception:
        logger.exception("FRED fetch failed for series %s", series_id)
        return None


async def sync_all_material_prices() -> dict:
    """Pull the latest value for every mapped material from FRED and insert a new
    price-history row for each, tagged source='live_sync'. Returns a summary dict
    used both by the scheduled job's log line and the manual 'Sync now' endpoint."""
    sb = _get_supabase()
    updated: list[str] = []
    skipped: list[str] = []

    for material, meta in FRED_SERIES.items():
        obs = await fetch_fred_latest(meta["series_id"])
        if obs is None:
            skipped.append(material)
            continue

        # Scoped to prior live_sync rows only — never compared against a manual/
        # extracted $/unit quote, which is on a completely different scale (see
        # the module docstring above and material_prices.py's _basis_for_source).
        prior_res = (
            sb.table("material_prices")
            .select("price")
            .eq("material", material)
            .eq("source", "live_sync")
            .order("fetched_at", desc=True)
            .limit(1)
            .execute()
        )
        prior_price = float(prior_res.data[0]["price"]) if prior_res.data else None
        if prior_price:
            raw_pct = ((obs["value"] - prior_price) / prior_price) * 100
            change_pct = round(max(-_MAX_CHANGE_PCT, min(_MAX_CHANGE_PCT, raw_pct)), 2)
        else:
            change_pct = 0.0

        sb.table("material_prices").insert({
            "material": material,
            "price": obs["value"],
            "unit": meta["unit"],
            "change_pct": change_pct,
            "year": datetime.now(timezone.utc).year,
            "source": "live_sync",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "notes": f"FRED series {meta['series_id']}, as of {obs.get('date')}",
        }).execute()
        updated.append(material)

    return {"updated": updated, "skipped": skipped}
