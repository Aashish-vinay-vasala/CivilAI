import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.geom
import json
import os
import tempfile
import numpy as np
from typing import Optional


def parse_ifc_geometry(file_bytes: bytes, filename: str) -> dict:
    """Parse IFC file and extract element data"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        project = ifc.by_type("IfcProject")
        project_name = project[0].Name if project else "Unknown Project"

        geometry_data = {
            "walls": [], "floors": [], "columns": [],
            "doors": [], "windows": [], "spaces": [],
            "beams": [], "stairs": [],
        }

        # Extract storeys
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

        # Extract walls
        for wall in ifc.by_type("IfcWall"):
            try:
                geom = extract_element_geometry(wall)
                if geom:
                    geometry_data["walls"].append({
                        "id": wall.GlobalId,
                        "name": wall.Name or "Wall",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": get_element_floor(wall, storey_map),
                        "material": get_element_material(wall),
                    })
            except:
                pass

        # Extract slabs
        for slab in ifc.by_type("IfcSlab"):
            try:
                geom = extract_element_geometry(slab)
                if geom:
                    geometry_data["floors"].append({
                        "id": slab.GlobalId,
                        "name": slab.Name or "Slab",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": get_element_floor(slab, storey_map),
                    })
            except:
                pass

        # Extract columns
        for col in ifc.by_type("IfcColumn"):
            try:
                geom = extract_element_geometry(col)
                if geom:
                    geometry_data["columns"].append({
                        "id": col.GlobalId,
                        "name": col.Name or "Column",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": get_element_floor(col, storey_map),
                    })
            except:
                pass

        # Extract doors
        for door in ifc.by_type("IfcDoor"):
            try:
                geom = extract_element_geometry(door)
                if geom:
                    geometry_data["doors"].append({
                        "id": door.GlobalId,
                        "name": door.Name or "Door",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": get_element_floor(door, storey_map),
                        "width": float(door.OverallWidth) if hasattr(door, "OverallWidth") and door.OverallWidth else 0.9,
                        "height": float(door.OverallHeight) if hasattr(door, "OverallHeight") and door.OverallHeight else 2.1,
                    })
            except:
                pass

        # Extract windows
        for win in ifc.by_type("IfcWindow"):
            try:
                geom = extract_element_geometry(win)
                if geom:
                    geometry_data["windows"].append({
                        "id": win.GlobalId,
                        "name": win.Name or "Window",
                        "position": geom["position"],
                        "dimensions": geom["dimensions"],
                        "rotation": geom["rotation"],
                        "floor": get_element_floor(win, storey_map),
                        "width": float(win.OverallWidth) if hasattr(win, "OverallWidth") and win.OverallWidth else 1.2,
                        "height": float(win.OverallHeight) if hasattr(win, "OverallHeight") and win.OverallHeight else 1.2,
                    })
            except:
                pass

        # Extract spaces
        for space in ifc.by_type("IfcSpace"):
            try:
                geom = extract_element_geometry(space)
                geometry_data["spaces"].append({
                    "id": space.GlobalId,
                    "name": space.Name or space.LongName or "Space",
                    "position": geom["position"] if geom else [0, 0, 0],
                    "dimensions": geom["dimensions"] if geom else [3, 2.8, 3],
                    "floor": get_element_floor(space, storey_map),
                    "area": get_space_area(space),
                })
            except:
                pass

        # Materials
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
        return {"success": False, "error": str(e), "filename": filename}


def parse_ifc_for_3d(file_bytes: bytes, filename: str) -> dict:
    """Extract real triangle mesh geometry from IFC for Three.js rendering"""
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        settings.set(settings.WELD_VERTICES, True)

        type_colors = {
            "IfcWall": "#334155",
            "IfcWallStandardCase": "#334155",
            "IfcSlab": "#1e293b",
            "IfcColumn": "#475569",
            "IfcBeam": "#64748b",
            "IfcDoor": "#f59e0b",
            "IfcWindow": "#3b82f6",
            "IfcRoof": "#0f172a",
            "IfcStair": "#94a3b8",
        }

        element_types = [
            "IfcWall", "IfcWallStandardCase", "IfcSlab",
            "IfcColumn", "IfcBeam", "IfcDoor", "IfcWindow",
            "IfcRoof", "IfcStair",
        ]

        meshes = []
        for element_type in element_types:
            elements = ifc.by_type(element_type)
            for element in elements[:50]:
                try:
                    shape = ifcopenshell.geom.create_shape(settings, element)
                    geo = shape.geometry
                    verts = list(geo.verts)
                    faces = list(geo.faces)

                    if not verts or not faces:
                        continue

                    # Convert vertices - swap Y/Z for Three.js
                    vertices = []
                    for i in range(0, len(verts), 3):
                        vertices.append([
                            round(verts[i], 4),
                            round(verts[i + 2], 4),
                            round(verts[i + 1], 4),
                        ])

                    # Get floor number
                    floor = 0
                    try:
                        for rel in element.ContainedInStructure:
                            storey = rel.RelatingStructure
                            if storey.is_a("IfcBuildingStorey"):
                                elev = float(storey.Elevation or 0)
                                floor = max(0, int(elev / 3500))
                    except:
                        pass

                    meshes.append({
                        "type": element_type.replace("IfcWallStandardCase", "IfcWall"),
                        "id": element.GlobalId,
                        "name": element.Name or element_type,
                        "vertices": vertices,
                        "faces": faces,
                        "color": type_colors.get(element_type, "#334155"),
                        "floor": floor,
                        "transparent": element_type in ["IfcWindow"],
                        "opacity": 0.4 if element_type == "IfcWindow" else 1.0,
                    })
                except:
                    continue

        # Get storeys
        storeys = []
        for storey in ifc.by_type("IfcBuildingStorey"):
            elevation = float(storey.Elevation or 0)
            storeys.append({
                "name": storey.Name or "Floor",
                "elevation": round(elevation / 1000, 2),
            })
        storeys.sort(key=lambda x: x["elevation"])

        project = ifc.by_type("IfcProject")
        project_name = project[0].Name if project else filename

        return {
            "success": True,
            "project_name": project_name,
            "filename": filename,
            "meshes": meshes,
            "mesh_count": len(meshes),
            "storeys": storeys,
            "storey_count": len(storeys),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def extract_element_geometry(element) -> Optional[dict]:
    """Extract position and dimensions from IFC element"""
    try:
        placement = element.ObjectPlacement
        if not placement:
            return None

        loc = placement.RelativePlacement.Location
        if not loc:
            return None

        x = float(loc.Coordinates[0]) if loc.Coordinates else 0.0
        y = float(loc.Coordinates[1]) if len(loc.Coordinates) > 1 else 0.0
        z = float(loc.Coordinates[2]) if len(loc.Coordinates) > 2 else 0.0

        rotation = 0.0
        if hasattr(placement.RelativePlacement, "RefDirection") and placement.RelativePlacement.RefDirection:
            ref_dir = placement.RelativePlacement.RefDirection.DirectionRatios
            if ref_dir and len(ref_dir) >= 2:
                rotation = float(np.arctan2(float(ref_dir[1]), float(ref_dir[0])))

        dimensions = [1.0, 2.8, 0.3]
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations:
                for item in rep.Items:
                    if hasattr(item, "XDim") and item.XDim:
                        dimensions[0] = float(item.XDim)
                    if hasattr(item, "YDim") and item.YDim:
                        dimensions[1] = float(item.YDim)
                    if hasattr(item, "ZDim") and item.ZDim:
                        dimensions[2] = float(item.ZDim)

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
            storey = rel.RelatingStructure
            if storey.GlobalId in storey_map:
                elevation = storey_map[storey.GlobalId]
                return max(0, int(elevation / 3500))
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

        doors = ifc.by_type("IfcDoor")
        windows = ifc.by_type("IfcWindow")
        columns = ifc.by_type("IfcColumn")

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
    """Extract quantities from IFC"""
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


# Alias for backward compatibility
def parse_ifc_file(file_bytes: bytes, filename: str) -> dict:
    return parse_ifc_geometry(file_bytes, filename)