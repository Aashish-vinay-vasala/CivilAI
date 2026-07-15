"""Regenerate the 2 committed fallback IFC fixtures.

Run whenever fallback_model_generator.py changes:
    python backend/scripts/generate_fallback_models.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.fallback_model_generator import FALLBACK_BUILDERS  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "data", "fallback_models")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, builder in FALLBACK_BUILDERS.items():
        ifc = builder()
        path = os.path.join(OUT_DIR, f"{slug}.ifc")
        ifc.write(path)
        n_elements = len(ifc.by_type("IfcElement"))
        n_storeys = len(ifc.by_type("IfcBuildingStorey"))
        print(f"{slug}: {n_elements} elements, {n_storeys} storeys -> {path}")


if __name__ == "__main__":
    main()
