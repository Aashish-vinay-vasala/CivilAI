import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from Pynite import FEModel3D
    HAS_PYNITE = True
except ImportError:
    HAS_PYNITE = False
    logger.warning("PyNiteFEA not installed — structural screening will be unavailable")

G_ACCEL = 9.81  # m/s^2
MAX_BEAMS_CHECKED = 100

# Assumed uniform live load for the screening check — not project-specific,
# this is a documented placeholder (general floor live load) so every beam
# gets a consistent, sane comparison load. Real design requires the actual
# occupancy load and tributary area from the project's structural drawings.
ASSUMED_LIVE_LOAD_KPA = 2.0
ASSUMED_TRIBUTARY_WIDTH_M = 3.0

DEFLECTION_LIMIT_RATIO = 360  # L/360, standard serviceability limit

DISCLAIMER = (
    "Preliminary structural screening only — not a certified design check. "
    "Each beam is modeled as an independently simply-supported single-span member "
    f"under self-weight plus an assumed {ASSUMED_LIVE_LOAD_KPA:.1f} kPa live load over a "
    f"{ASSUMED_TRIBUTARY_WIDTH_M:.1f} m tributary width, checked against an L/{DEFLECTION_LIMIT_RATIO} "
    "deflection limit. It does not account for real support/continuity conditions, "
    "actual occupancy loads, rebar/connection design, or code-specific load combinations. "
    "Always verify with a licensed structural engineer."
)

# Material defaults keyed by substring match on the IFC-extracted material name.
# E/G in Pa, density in kg/m^3, allowable_stress (Pa) already includes a safety
# factor — these are typical textbook values, not project-specific.
_MATERIALS = {
    "steel":    {"E": 200e9, "nu": 0.3,  "density": 7850, "allowable_stress": 150e6},  # mild steel, 0.6*Fy(250MPa)
    "timber":   {"E": 11e9,  "nu": 0.35, "density": 500,  "allowable_stress": 10e6},   # typical softwood
    "wood":     {"E": 11e9,  "nu": 0.35, "density": 500,  "allowable_stress": 10e6},
    "concrete": {"E": 25e9,  "nu": 0.2,  "density": 2400, "allowable_stress": 11e6},   # ~0.45*f'ck for C25/30
}
_DEFAULT_MATERIAL = _MATERIALS["concrete"]


def _material_properties(material_name: str) -> dict:
    name = (material_name or "").lower()
    for key, props in _MATERIALS.items():
        if key in name:
            return props
    return _DEFAULT_MATERIAL


def _section_properties(width: float, height: float) -> dict:
    """Rectangular section properties. `height` is the dimension resisting
    vertical (gravity) bending, `width` is the other in-plane cross-section dim."""
    width = max(width, 0.05)
    height = max(height, 0.05)
    area = width * height
    iz = width * height ** 3 / 12  # bending about local z — resists vertical load
    iy = height * width ** 3 / 12  # weak axis
    j = iy + iz  # crude torsion constant approximation; torsion isn't loaded here
    return {"A": area, "Iy": iy, "Iz": iz, "J": j}


def analyze_beam(beam: dict) -> Optional[dict]:
    """Run a single-span simply-supported FEA check on one extracted beam element."""
    if not HAS_PYNITE:
        return None
    dims = beam.get("dimensions") or []
    if len(dims) < 3:
        return None

    # bim_service's extractor puts the extrusion Depth (the beam's actual span)
    # into dims[1]; dims[0]/dims[2] are the swept profile's two cross-section
    # dims with no reliable orientation info, so the deeper of the two is
    # assumed to be the vertical (bending-resisting) dimension — standard
    # practice for beams (depth > width) but an approximation nonetheless.
    length = max(float(dims[1]), 0.5)
    profile_a, profile_b = float(dims[0]), float(dims[2])
    height = max(profile_a, profile_b)
    width = min(profile_a, profile_b)
    if length < 0.5 or height <= 0 or width <= 0:
        return None

    mat = _material_properties(beam.get("material", ""))
    sec = _section_properties(width, height)

    try:
        model = FEModel3D()
        model.add_material("Mat", mat["E"], mat["E"] / (2 * (1 + mat["nu"])), mat["nu"], mat["density"])
        model.add_section("Sec", sec["A"], sec["Iy"], sec["Iz"], sec["J"])
        model.add_node("N1", 0, 0, 0)
        model.add_node("N2", length, 0, 0)
        # Pin-pin: translations restrained at both ends (N2 free axially as a roller),
        # RZ free at both ends so the member can rotate — standard simple-support idealization.
        model.def_support("N1", True, True, True, True, True, False)
        model.def_support("N2", False, True, True, True, True, False)
        model.add_member("M1", "N1", "N2", "Mat", "Sec")

        self_weight_udl = mat["density"] * G_ACCEL * sec["A"]  # N/m
        live_load_udl = ASSUMED_LIVE_LOAD_KPA * 1000 * ASSUMED_TRIBUTARY_WIDTH_M  # N/m
        total_udl = self_weight_udl + live_load_udl
        model.add_member_dist_load("M1", "FY", -total_udl, -total_udl, case="Case 1")
        model.add_load_combo("Combo 1", {"Case 1": 1.0})
        model.analyze(check_statics=False)

        member = model.members["M1"]
        deflection_m = max(
            abs(member.max_deflection("dy", "Combo 1")),
            abs(member.min_deflection("dy", "Combo 1")),
        )
        moment_nm = max(
            abs(member.max_moment("Mz", "Combo 1")),
            abs(member.min_moment("Mz", "Combo 1")),
        )
    except Exception as e:
        logger.debug("Structural analysis failed for beam %s: %s", beam.get("id", "?"), e)
        return None

    bending_stress_pa = moment_nm * (height / 2) / sec["Iz"]
    deflection_limit_m = length / DEFLECTION_LIMIT_RATIO

    utilization_deflection = deflection_m / deflection_limit_m if deflection_limit_m else 0
    utilization_stress = bending_stress_pa / mat["allowable_stress"] if mat["allowable_stress"] else 0
    utilization = max(utilization_deflection, utilization_stress)

    if utilization > 1.0:
        status = "Fail"
    elif utilization >= 0.85:
        status = "Warning"
    else:
        status = "Pass"

    return {
        "id": beam.get("id"),
        "name": beam.get("name") or "Beam",
        "material": beam.get("material", "Concrete"),
        "length_m": round(length, 2),
        "deflection_mm": round(deflection_m * 1000, 2),
        "deflection_limit_mm": round(deflection_limit_m * 1000, 2),
        "utilization_deflection": round(utilization_deflection, 3),
        "max_moment_kNm": round(moment_nm / 1000, 2),
        "bending_stress_mpa": round(bending_stress_pa / 1e6, 2),
        "allowable_stress_mpa": round(mat["allowable_stress"] / 1e6, 2),
        "utilization_stress": round(utilization_stress, 3),
        "status": status,
    }


def run_structural_screening(geometry: dict) -> dict:
    """Screen every extracted beam element and return a pass/warning/fail summary."""
    if not HAS_PYNITE:
        return {"success": False, "error": "PyNiteFEA not installed"}

    beams = (geometry or {}).get("beams", [])[:MAX_BEAMS_CHECKED]
    results = []
    for beam in beams:
        try:
            result = analyze_beam(beam)
            if result:
                results.append(result)
        except Exception as e:
            logger.debug("Skipped beam %s: %s", beam.get("id", "?"), e)

    passed = sum(1 for r in results if r["status"] == "Pass")
    warnings = sum(1 for r in results if r["status"] == "Warning")
    failed = sum(1 for r in results if r["status"] == "Fail")

    return {
        "success": True,
        "disclaimer": DISCLAIMER,
        "total_checked": len(results),
        "passed": passed,
        "warnings": warnings,
        "failed": failed,
        "results": results,
    }
