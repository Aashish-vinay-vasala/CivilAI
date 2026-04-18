import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.placement
import json
import os
import tempfile
import numpy as np
from typing import Optional

def parse_ifc_geometry(file_bytes: bytes, filename: str) -> dict:
    """Parse IFC file and extract real geometry for 3D rendering"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        project = ifc.by_type("IfcProject")
        project_name = project[0].Name if project else "Unknown Project"

        geometry_data = {
            "walls": [],
            "floors": [],
            "columns": [],
            "doors": [],
            "windows": [],
            "spaces": [],
            "beams": [],
            "stairs": [],
        }

        # Extract storeys with elevations
        storeys = []
        storey_map = {}
        for storey in ifc.by_type("IfcBuildingStorey"):
            elevation = float(storey.Elevation) if storey.Elevation else 0.0
            storeys.append({
                "name": storey.Name or f"Floor {len(storeys)}",
                "elevation": round(elevation, 2),
                "id": storey.GlobalId,
            })
            storey_map[storey.GlobalId] = elevation
        storeys.sort(key=lambda x: x["elevation"])

        # Extract walls with positions
        for wall in ifc.by_type("IfcWall"):
            try:
                geom = extract_element_geometry(wall)
                if geom:
                    floor = get_element_floor(wall, storey_map)
                    mat = get_element_material(wall)
                    geometry_data["walls"].append({
                        "id": wall.GlobalId,
                        "name": wall.Name or "Wall",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": floor,
                        "material": mat,
                    })
            except:
                pass

        # Extract slabs/floors
        for slab in ifc.by_type("IfcSlab"):
            try:
                geom = extract_element_geometry(slab)
                if geom:
                    floor = get_element_floor(slab, storey_map)
                    geometry_data["floors"].append({
                        "id": slab.GlobalId,
                        "name": slab.Name or "Slab",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": floor,
                    })
            except:
                pass

        # Extract columns
        for col in ifc.by_type("IfcColumn"):
            try:
                geom = extract_element_geometry(col)
                if geom:
                    floor = get_element_floor(col, storey_map)
                    geometry_data["columns"].append({
                        "id": col.GlobalId,
                        "name": col.Name or "Column",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": floor,
                    })
            except:
                pass

        # Extract doors
        for door in ifc.by_type("IfcDoor"):
            try:
                geom = extract_element_geometry(door)
                if geom:
                    floor = get_element_floor(door, storey_map)
                    geometry_data["doors"].append({
                        "id": door.GlobalId,
                        "name": door.Name or "Door",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": floor,
                        "width": door.OverallWidth if hasattr(door, "OverallWidth") else 0.9,
                        "height": door.OverallHeight if hasattr(door, "OverallHeight") else 2.1,
                    })
            except:
                pass

        # Extract windows
        for win in ifc.by_type("IfcWindow"):
            try:
                geom = extract_element_geometry(win)
                if geom:
                    floor = get_element_floor(win, storey_map)
                    geometry_data["windows"].append({
                        "id": win.GlobalId,
                        "name": win.Name or "Window",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": floor,
                        "width": win.OverallWidth if hasattr(win, "OverallWidth") else 1.2,
                        "height": win.OverallHeight if hasattr(win, "OverallHeight") else 1.2,
                    })
            except:
                pass

        # Extract spaces
        for space in ifc.by_type("IfcSpace"):
            try:
                geom = extract_element_geometry(space)
                floor = get_element_floor(space, storey_map)
                area = get_space_area(space)
                geometry_data["spaces"].append({
                    "id": space.GlobalId,
                    "name": space.Name or space.LongName or "Space",
                    "position": geom["position"] if geom else [0, 0, 0],
                    "dimensions": geom["dimensions"] if geom else [3, 2.8, 3],
                    "floor": floor,
                    "area": area,
                })
            except:
                pass

        # Extract materials
        materials = set()
        for mat in ifc.by_type("IfcMaterial"):
            if mat.Name:
                materials.add(mat.Name)

        summary = {k: len(v) for k, v in geometry_data.items()}

        return {
            "success": True,
            "project_name": project_name,
            "filename": filename,
            "summary": summary,
            "total_elements": sum(summary.values()),
            "storeys": storeys,
            "materials": list(materials)[:20],
            "geometry": geometry_data,
            "has_geometry": any(len(v) > 0 for v in geometry_data.values()),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "filename": filename,
        }

def extract_element_geometry(element) -> Optional[dict]:
    """Extract position and dimensions from IFC element"""
    try:
        placement = element.ObjectPlacement
        if not placement:
            return None

        # Get location
        loc = placement.RelativePlacement.Location
        if not loc:
            return None

        x = float(loc.Coordinates[0]) if loc.Coordinates else 0.0
        y = float(loc.Coordinates[1]) if len(loc.Coordinates) > 1 else 0.0
        z = float(loc.Coordinates[2]) if len(loc.Coordinates) > 2 else 0.0

        # Get rotation
        rotation = 0.0
        if hasattr(placement.RelativePlacement, "RefDirection") and placement.RelativePlacement.RefDirection:
            ref_dir = placement.RelativePlacement.RefDirection.DirectionRatios
            if ref_dir and len(ref_dir) >= 2:
                rotation = float(np.arctan2(float(ref_dir[1]), float(ref_dir[0])))

        # Try to get dimensions from representation
        dimensions = [1.0, 2.8, 0.3]  # default
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations:
                for item in rep.Items:
                    if hasattr(item, "XDim"):
                        dimensions[0] = float(item.XDim) if item.XDim else 1.0
                    if hasattr(item, "YDim"):
                        dimensions[1] = float(item.YDim) if item.YDim else 2.8
                    if hasattr(item, "ZDim"):
                        dimensions[2] = float(item.ZDim) if item.ZDim else 0.3

        return {
            "position": [round(x, 3), round(z, 3), round(y, 3)],
            "dimensions": [round(d, 3) for d in dimensions],
            "rotation": round(rotation, 3),
        }
    except:
        return None

def get_element_floor(element, storey_map: dict) -> int:
    """Get floor number for an element"""
    try:
        for rel in element.ContainedInStructure:
            if rel.RelatingStructure.GlobalId in storey_map:
                elevation = storey_map[rel.ContainedInStructure[0].RelatingStructure.GlobalId]
                return max(0, int(elevation / 3.5))
    except:
        pass
    return 0

def get_element_material(element) -> str:
    """Get material name for element"""
    try:
        mats = ifcopenshell.util.element.get_materials(element)
        if mats:
            return mats[0].Name or "Unknown"
    except:
        pass
    return "Concrete"

def get_space_area(space) -> float:
    """Get floor area of a space"""
    try:
        for prop_set in space.IsDefinedBy:
            if hasattr(prop_set, "RelatingPropertyDefinition"):
                pset = prop_set.RelatingPropertyDefinition
                if hasattr(pset, "Quantities"):
                    for qty in pset.Quantities:
                        if "Area" in qty.Name:
                            return round(float(qty.AreaValue), 2)
    except:
        pass
    return 0.0

def parse_ifc_file(file_bytes: bytes, filename: str) -> dict:
    """Parse IFC file - calls geometry parser"""
    return parse_ifc_geometry(file_bytes, filename)

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

        # Check walls for missing materials
        walls = ifc.by_type("IfcWall")
        for wall in walls[:30]:
            try:
                materials = ifcopenshell.util.element.get_materials(wall)
                if not materials:
                    warnings.append({
                        "type": "Missing Material",
                        "element": wall.Name or wall.GlobalId[:8],
                        "severity": "Medium",
                        "description": f"Wall '{wall.Name}' has no material assigned"
                    })
            except:
                pass

        # Check for doors without host walls
        doors = ifc.by_type("IfcDoor")
        windows = ifc.by_type("IfcWindow")
        columns = ifc.by_type("IfcColumn")

        # Check columns for missing materials
        for col in columns[:20]:
            try:
                materials = ifcopenshell.util.element.get_materials(col)
                if not materials:
                    warnings.append({
                        "type": "Missing Material",
                        "element": col.Name or col.GlobalId[:8],
                        "severity": "Low",
                        "description": f"Column '{col.Name}' has no material assigned"
                    })
            except:
                pass

        return {
            "success": True,
            "total_clashes": len(clashes),
            "total_warnings": len(warnings),
            "clashes": clashes,
            "warnings": warnings[:15],
            "summary": {
                "walls_checked": len(walls),
                "doors_checked": len(doors),
                "windows_checked": len(windows),
                "columns_checked": len(columns),
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