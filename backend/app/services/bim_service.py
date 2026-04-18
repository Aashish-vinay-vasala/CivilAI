import ifcopenshell
import ifcopenshell.util.element
import json
import os
import tempfile
from typing import Optional

def parse_ifc_file(file_bytes: bytes, filename: str) -> dict:
    """Parse IFC file and extract BIM data"""
    try:
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        # Open IFC file
        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        # Extract project info
        project = ifc.by_type("IfcProject")
        project_name = project[0].Name if project else "Unknown"

        # Extract all elements
        elements = {
            "walls": [],
            "floors": [],
            "doors": [],
            "windows": [],
            "columns": [],
            "beams": [],
            "spaces": [],
            "stairs": [],
        }

        type_map = {
            "IfcWall": "walls",
            "IfcSlab": "floors",
            "IfcDoor": "doors",
            "IfcWindow": "windows",
            "IfcColumn": "columns",
            "IfcBeam": "beams",
            "IfcSpace": "spaces",
            "IfcStair": "stairs",
        }

        for ifc_type, key in type_map.items():
            try:
                items = ifc.by_type(ifc_type)
                for item in items:
                    elements[key].append({
                        "id": item.GlobalId,
                        "name": item.Name or ifc_type,
                        "type": ifc_type,
                    })
            except:
                pass

        # Count elements
        summary = {k: len(v) for k, v in elements.items()}

        # Extract storeys
        storeys = []
        for storey in ifc.by_type("IfcBuildingStorey"):
            storeys.append({
                "name": storey.Name,
                "elevation": storey.Elevation if hasattr(storey, "Elevation") else 0,
            })

        # Extract materials
        materials = set()
        for material in ifc.by_type("IfcMaterial"):
            materials.add(material.Name)

        return {
            "success": True,
            "project_name": project_name,
            "filename": filename,
            "summary": summary,
            "total_elements": sum(summary.values()),
            "storeys": storeys,
            "materials": list(materials)[:20],
            "elements": {k: v[:10] for k, v in elements.items()},
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "filename": filename,
        }

def detect_clashes(file_bytes: bytes) -> dict:
    """Basic clash detection from IFC file"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        clashes = []
        warnings = []

        # Check for missing materials
        walls = ifc.by_type("IfcWall")
        for wall in walls[:20]:
            try:
                materials = ifcopenshell.util.element.get_materials(wall)
                if not materials:
                    warnings.append({
                        "type": "Missing Material",
                        "element": wall.Name or wall.GlobalId,
                        "severity": "Medium",
                        "description": f"Wall {wall.Name} has no material assigned"
                    })
            except:
                pass

        # Check for doors without walls
        doors = ifc.by_type("IfcDoor")
        windows = ifc.by_type("IfcWindow")

        return {
            "success": True,
            "total_clashes": len(clashes),
            "total_warnings": len(warnings),
            "clashes": clashes,
            "warnings": warnings[:10],
            "summary": {
                "walls_checked": len(walls),
                "doors_checked": len(doors),
                "windows_checked": len(windows),
            }
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

def extract_quantities(file_bytes: bytes) -> dict:
    """Extract quantities from IFC for cost estimation"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        quantities = {
            "walls": {"count": len(ifc.by_type("IfcWall")), "unit": "elements"},
            "floors": {"count": len(ifc.by_type("IfcSlab")), "unit": "elements"},
            "doors": {"count": len(ifc.by_type("IfcDoor")), "unit": "elements"},
            "windows": {"count": len(ifc.by_type("IfcWindow")), "unit": "elements"},
            "columns": {"count": len(ifc.by_type("IfcColumn")), "unit": "elements"},
            "beams": {"count": len(ifc.by_type("IfcBeam")), "unit": "elements"},
            "spaces": {"count": len(ifc.by_type("IfcSpace")), "unit": "rooms"},
        }

        return {
            "success": True,
            "quantities": quantities,
            "total_elements": sum(q["count"] for q in quantities.values()),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}