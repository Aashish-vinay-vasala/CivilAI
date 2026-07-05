import logging

logger = logging.getLogger(__name__)

try:
    import ifcopenshell
    import ifcopenshell.util.element
    import ifcopenshell.geom
    HAS_IFC = True
except ImportError:
    HAS_IFC = False
    logger.warning("ifcopenshell not installed — IFC parsing will be unavailable")

import os
import tempfile
import numpy as np
from typing import Optional


# ─── Storey Helpers ───────────────────────────────────────────────────────────

def _build_storey_floor_map(ifc) -> dict:
    """Return {GlobalId: floor_index} where 0 is the lowest storey by elevation."""
    storeys = []
    for storey in ifc.by_type("IfcBuildingStorey"):
        elevation = float(storey.Elevation or 0)
        storeys.append((elevation, storey.GlobalId))
    storeys.sort(key=lambda x: x[0])
    return {gid: idx for idx, (_, gid) in enumerate(storeys)}


def _floor_idx(element, storey_floor_map: dict) -> int:
    """Return 0-based floor index using storey membership (unit-agnostic)."""
    try:
        for rel in element.ContainedInStructure:
            storey = rel.RelatingStructure
            if storey.is_a("IfcBuildingStorey") and storey.GlobalId in storey_floor_map:
                return storey_floor_map[storey.GlobalId]
    except Exception:
        pass
    return 0


def get_element_floor(element, storey_map: dict) -> int:
    """Legacy: storey_map is {GlobalId: raw_elevation}. Used by _extract_placement_meshes."""
    try:
        for rel in element.ContainedInStructure:
            storey = rel.RelatingStructure
            if storey.GlobalId in storey_map:
                elevation = storey_map[storey.GlobalId]
                # Detect mm vs m: if any elevation > 100 it's mm
                max_elev = max(storey_map.values(), default=0)
                storey_height = 3500 if max_elev > 100 else 3.5
                return max(0, int(elevation / storey_height))
    except Exception:
        pass
    return 0


# ─── Dimension Extraction ─────────────────────────────────────────────────────

def _extract_dims_from_item(item, dims: list) -> None:
    """
    Fill dims=[width, height, depth] from a representation item.
    Handles IfcBoundingBox, IfcExtrudedAreaSolid (with IfcRectangleProfileDef),
    and IfcBooleanClippingResult by recursing into FirstOperand.
    """
    try:
        # Direct box dims (IfcBoundingBox, IfcBlock)
        if hasattr(item, "XDim") and item.XDim:
            dims[0] = float(item.XDim)
        if hasattr(item, "YDim") and item.YDim:
            dims[2] = float(item.YDim)
        if hasattr(item, "ZDim") and item.ZDim:
            dims[1] = float(item.ZDim)

        # IfcExtrudedAreaSolid with rectangular profile
        if hasattr(item, "SweptArea") and item.SweptArea:
            profile = item.SweptArea
            depth = float(item.Depth) if hasattr(item, "Depth") and item.Depth else None
            if hasattr(profile, "XDim") and profile.XDim:
                dims[0] = float(profile.XDim)
            if hasattr(profile, "YDim") and profile.YDim:
                dims[2] = float(profile.YDim)
            if depth:
                dims[1] = depth

        # Boolean result — recurse into the uncut solid
        if hasattr(item, "FirstOperand") and item.FirstOperand:
            _extract_dims_from_item(item.FirstOperand, dims)
    except Exception:
        pass


def extract_element_geometry(element) -> Optional[dict]:
    """Extract world-space position, dimensions [w,h,d], and Y-rotation from an IFC element."""
    try:
        placement = element.ObjectPlacement
        if not placement or not hasattr(placement, "RelativePlacement"):
            return None
        rp = placement.RelativePlacement
        loc = rp.Location
        if not loc:
            return None

        coords = loc.Coordinates
        x = float(coords[0]) if coords else 0.0
        y = float(coords[1]) if len(coords) > 1 else 0.0
        z = float(coords[2]) if len(coords) > 2 else 0.0

        rotation = 0.0
        if hasattr(rp, "RefDirection") and rp.RefDirection:
            rd = rp.RefDirection.DirectionRatios
            if rd and len(rd) >= 2:
                rotation = float(np.arctan2(float(rd[1]), float(rd[0])))

        dims = [1.0, 2.8, 0.3]
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations:
                for item in rep.Items:
                    _extract_dims_from_item(item, dims)
                    if dims != [1.0, 2.8, 0.3]:
                        break
                if dims != [1.0, 2.8, 0.3]:
                    break

        # IFC (East, North, Up) → Three.js (East, Up, South)
        return {
            "position": [round(x, 3), round(z, 3), round(y, 3)],
            "dimensions": [round(d, 3) for d in dims],
            "rotation": round(rotation, 3),
        }
    except Exception:
        logger.debug("extract_element_geometry failed for %s", getattr(element, "GlobalId", "?"))
        return None


# ─── Material / Space Helpers ─────────────────────────────────────────────────

def get_element_material(element) -> str:
    try:
        mats = ifcopenshell.util.element.get_materials(element)
        if mats:
            return mats[0].Name or "Unknown"
    except Exception:
        pass
    return "Concrete"


def get_space_area(space) -> float:
    try:
        for prop_set in space.IsDefinedBy:
            if hasattr(prop_set, "RelatingPropertyDefinition"):
                pset = prop_set.RelatingPropertyDefinition
                if hasattr(pset, "Quantities"):
                    for qty in pset.Quantities:
                        if "Area" in qty.Name:
                            return round(float(qty.AreaValue), 2)
    except Exception:
        pass
    return 0.0


# ─── IFC Geometry Parsing ─────────────────────────────────────────────────────

def parse_ifc_geometry(file_bytes: bytes, filename: str) -> dict:
    """Parse IFC file and extract element metadata (positions, counts, materials)."""
    if not HAS_IFC:
        return {"success": False, "error": "ifcopenshell not installed", "filename": filename}
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        project = ifc.by_type("IfcProject")
        project_name = project[0].Name if project else "Unknown Project"

        storey_floor_map = _build_storey_floor_map(ifc)
        storeys = []
        for storey in ifc.by_type("IfcBuildingStorey"):
            elevation = float(storey.Elevation) if storey.Elevation else 0.0
            storeys.append({
                "name": storey.Name or f"Floor {len(storeys)}",
                "elevation": round(elevation, 2),
                "id": storey.GlobalId,
            })
        storeys.sort(key=lambda x: x["elevation"])

        geometry_data: dict = {
            k: [] for k in ["walls", "floors", "columns", "beams", "doors", "windows", "spaces", "roofs", "stairs"]
        }

        def _append(bucket: str, element, extra=None):
            try:
                geom = extract_element_geometry(element)
                if not geom:
                    return
                record = {
                    "id": element.GlobalId,
                    "name": element.Name or bucket.rstrip("s"),
                    "position": geom["position"],
                    "dimensions": geom["dimensions"],
                    "rotation": geom["rotation"],
                    "floor": _floor_idx(element, storey_floor_map),
                }
                if extra:
                    record.update(extra)
                geometry_data[bucket].append(record)
            except Exception:
                logger.debug("Skipped %s %s", bucket, getattr(element, "GlobalId", "?"))

        for el in ifc.by_type("IfcWall"):
            _append("walls", el, {"material": get_element_material(el)})
        for el in ifc.by_type("IfcSlab"):
            _append("floors", el)
        for el in ifc.by_type("IfcColumn"):
            _append("columns", el, {"material": get_element_material(el)})
        for el in ifc.by_type("IfcBeam"):
            _append("beams", el, {"material": get_element_material(el)})
        for el in ifc.by_type("IfcDoor"):
            _append("doors", el, {
                "width": float(el.OverallWidth) if hasattr(el, "OverallWidth") and el.OverallWidth else 0.9,
                "height": float(el.OverallHeight) if hasattr(el, "OverallHeight") and el.OverallHeight else 2.1,
            })
        for el in ifc.by_type("IfcWindow"):
            _append("windows", el, {
                "width": float(el.OverallWidth) if hasattr(el, "OverallWidth") and el.OverallWidth else 1.2,
                "height": float(el.OverallHeight) if hasattr(el, "OverallHeight") and el.OverallHeight else 1.2,
            })
        for space in ifc.by_type("IfcSpace"):
            try:
                geom = extract_element_geometry(space)
                geometry_data["spaces"].append({
                    "id": space.GlobalId,
                    "name": space.Name or space.LongName or "Space",
                    "position": geom["position"] if geom else [0, 0, 0],
                    "dimensions": geom["dimensions"] if geom else [3, 2.8, 3],
                    "floor": _floor_idx(space, storey_floor_map),
                    "area": get_space_area(space),
                })
            except Exception:
                pass
        for el in ifc.by_type("IfcRoof"):
            _append("roofs", el)
        for el in ifc.by_type("IfcStair"):
            _append("stairs", el)

        materials = {mat.Name for mat in ifc.by_type("IfcMaterial") if mat.Name}
        summary = {k: len(v) for k, v in geometry_data.items()}

        # Raw counts independent of geometry extraction (used by generate_boq as fallback)
        raw_counts = {
            "walls":   len(ifc.by_type("IfcWall")) + len(ifc.by_type("IfcWallStandardCase")),
            "floors":  len(ifc.by_type("IfcSlab")),
            "columns": len(ifc.by_type("IfcColumn")),
            "beams":   len(ifc.by_type("IfcBeam")),
            "doors":   len(ifc.by_type("IfcDoor")),
            "windows": len(ifc.by_type("IfcWindow")),
            "spaces":  len(ifc.by_type("IfcSpace")),
            "roofs":   len(ifc.by_type("IfcRoof")),
            "stairs":  len(ifc.by_type("IfcStair")),
        }
        raw_total = sum(raw_counts.values())

        return {
            "success": True,
            "project_name": project_name,
            "filename": filename,
            "summary": summary,
            "total_elements": raw_total or sum(summary.values()),
            "storeys": storeys,
            "materials": list(materials)[:20],
            "geometry": geometry_data,
            "raw_counts": raw_counts,
            "has_geometry": any(len(v) > 0 for v in geometry_data.values()),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "filename": filename}


# ─── 3D Mesh Extraction ───────────────────────────────────────────────────────

_TYPE_COLORS = {
    "IfcWall": "#334155", "IfcWallStandardCase": "#334155",
    "IfcSlab": "#1e293b", "IfcColumn": "#475569", "IfcBeam": "#64748b",
    "IfcDoor": "#f59e0b", "IfcWindow": "#3b82f6",
    "IfcRoof": "#0f172a", "IfcStair": "#94a3b8",
}
_MESH_TYPES = list(_TYPE_COLORS.keys())


def _extract_geom_meshes(ifc) -> list:
    """Extract real triangle meshes via ifcopenshell.geom.create_shape."""
    sfm = _build_storey_floor_map(ifc)
    settings = ifcopenshell.geom.settings()
    for flag in ("USE_WORLD_COORDS", "WELD_VERTICES"):
        try:
            settings.set(getattr(settings, flag), True)
        except Exception:
            pass

    meshes = []
    for element_type in _MESH_TYPES:
        for element in ifc.by_type(element_type)[:50]:
            try:
                shape = ifcopenshell.geom.create_shape(settings, element)
                geo = shape.geometry
                verts = list(geo.verts)
                faces = list(geo.faces)
                if not verts or not faces:
                    continue
                # IFC (East, North, Up) → Three.js (East, Up, South)
                vertices = [
                    [round(verts[i], 4), round(verts[i + 2], 4), round(verts[i + 1], 4)]
                    for i in range(0, len(verts), 3)
                ]
                meshes.append({
                    "type": element_type.replace("IfcWallStandardCase", "IfcWall"),
                    "id": element.GlobalId,
                    "name": element.Name or element_type,
                    "vertices": vertices,
                    "faces": faces,
                    "color": _TYPE_COLORS.get(element_type, "#334155"),
                    "floor": _floor_idx(element, sfm),
                    "transparent": element_type == "IfcWindow",
                    "opacity": 0.4 if element_type == "IfcWindow" else 1.0,
                })
            except Exception:
                logger.debug("Skipped mesh %s %s", element_type, getattr(element, "GlobalId", "?"))
    return meshes


def _box_mesh(px: float, py: float, pz: float, w: float, h: float, d: float):
    """Build a box (8 verts, 12 triangles) centered on x/z, sitting on y."""
    hw, hd = max(w, 0.05) / 2, max(d, 0.05) / 2
    h = max(h, 0.05)
    v = [
        [px - hw, py,     pz - hd], [px + hw, py,     pz - hd],
        [px + hw, py + h, pz - hd], [px - hw, py + h, pz - hd],
        [px - hw, py,     pz + hd], [px + hw, py,     pz + hd],
        [px + hw, py + h, pz + hd], [px - hw, py + h, pz + hd],
    ]
    f = [0,1,2, 0,2,3, 5,4,7, 5,7,6, 4,0,3, 4,3,7, 1,5,6, 1,6,2, 4,5,1, 4,1,0, 3,2,6, 3,6,7]
    return v, f


def _extract_placement_meshes(ifc) -> list:
    """Fallback: approximate box meshes from ObjectPlacement when geom fails."""
    sfm = _build_storey_floor_map(ifc)
    meshes = []
    for element_type, color in _TYPE_COLORS.items():
        for element in ifc.by_type(element_type)[:50]:
            try:
                geom = extract_element_geometry(element)
                if not geom:
                    continue
                px, py, pz = geom["position"]
                w, h, d = geom["dimensions"]
                verts, faces = _box_mesh(px, py, pz, w, h, d)
                meshes.append({
                    "type": element_type.replace("IfcWallStandardCase", "IfcWall"),
                    "id": element.GlobalId,
                    "name": element.Name or element_type,
                    "vertices": verts,
                    "faces": faces,
                    "color": color,
                    "floor": _floor_idx(element, sfm),
                    "transparent": element_type == "IfcWindow",
                    "opacity": 0.4 if element_type == "IfcWindow" else 1.0,
                })
            except Exception:
                continue
    return meshes


def parse_ifc_for_3d(file_bytes: bytes, filename: str) -> dict:
    """Extract triangle mesh geometry from IFC for Three.js rendering."""
    if not HAS_IFC:
        return {"success": False, "error": "ifcopenshell not installed on server"}
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        meshes = _extract_geom_meshes(ifc)
        if not meshes:
            meshes = _extract_placement_meshes(ifc)

        # Detect mm vs m: divide by 1000 if any elevation looks like millimetres
        raw_elevations = [float(s.Elevation or 0) for s in ifc.by_type("IfcBuildingStorey")]
        scale = 1000.0 if raw_elevations and max(raw_elevations, default=0) > 100 else 1.0

        storeys = []
        for storey in ifc.by_type("IfcBuildingStorey"):
            elevation = float(storey.Elevation or 0) / scale
            storeys.append({"name": storey.Name or "Floor", "elevation": round(elevation, 2)})
        storeys.sort(key=lambda x: x["elevation"])

        project = ifc.by_type("IfcProject")
        return {
            "success": True,
            "project_name": project[0].Name if project else filename,
            "filename": filename,
            "meshes": meshes,
            "mesh_count": len(meshes),
            "storeys": storeys,
            "storey_count": len(storeys),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── AABB Clash Detection ─────────────────────────────────────────────────────

def _get_aabb(element) -> Optional[dict]:
    """Return {min:[x,y,z], max:[x,y,z], name:str} or None."""
    geom = extract_element_geometry(element)
    if not geom:
        return None
    x, y, z = geom["position"]
    w, h, d = geom["dimensions"]
    hw, hd = max(w, 0.05) / 2, max(d, 0.05) / 2
    return {
        "min": [x - hw, y, z - hd],
        "max": [x + hw, y + h, z + hd],
        "name": getattr(element, "Name", None) or element.GlobalId[:8],
    }


def _overlap_volume(a: dict, b: dict) -> float:
    dx = min(a["max"][0], b["max"][0]) - max(a["min"][0], b["min"][0])
    dy = min(a["max"][1], b["max"][1]) - max(a["min"][1], b["min"][1])
    dz = min(a["max"][2], b["max"][2]) - max(a["min"][2], b["min"][2])
    return max(0.0, dx) * max(0.0, dy) * max(0.0, dz)


def _aabb_intersects(a: dict, b: dict, tol: float = 0.0) -> bool:
    return (
        a["min"][0] < b["max"][0] - tol and a["max"][0] > b["min"][0] + tol and
        a["min"][1] < b["max"][1] - tol and a["max"][1] > b["min"][1] + tol and
        a["min"][2] < b["max"][2] - tol and a["max"][2] > b["min"][2] + tol
    )


def detect_clashes(file_bytes: bytes, file_bytes2: Optional[bytes] = None) -> dict:
    """AABB-based geometry clash detection + optional cross-model (structural vs MEP) clash."""
    if not HAS_IFC:
        return {"success": False, "error": "ifcopenshell not installed"}
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        clashes = []
        warnings = []

        walls = list(ifc.by_type("IfcWall"))[:60]
        columns = list(ifc.by_type("IfcColumn"))[:40]
        beams = list(ifc.by_type("IfcBeam"))[:40]
        doors = list(ifc.by_type("IfcDoor"))[:40]
        windows = list(ifc.by_type("IfcWindow"))[:40]
        slabs = list(ifc.by_type("IfcSlab"))[:30]

        def _boxes(elements):
            result = []
            for el in elements:
                bb = _get_aabb(el)
                if bb is not None:
                    result.append((el, bb))
            return result

        wall_boxes = _boxes(walls)
        col_boxes = _boxes(columns)
        beam_boxes = _boxes(beams)
        slab_boxes = _boxes(slabs)
        door_boxes = _boxes(doors)

        # --- Material warnings ---
        for el in walls[:30] + columns[:20] + beams[:20]:
            try:
                if not ifcopenshell.util.element.get_materials(el):
                    warnings.append({
                        "type": "Missing Material",
                        "element": getattr(el, "Name", None) or el.GlobalId[:8],
                        "severity": "Medium",
                        "description": f"{el.is_a()} '{getattr(el, 'Name', None) or el.GlobalId[:8]}' has no material assigned",
                    })
            except Exception:
                pass

        # --- Column–Column clashes ---
        for i, (_, ba) in enumerate(col_boxes):
            for _, bb in col_boxes[i + 1:]:
                if _aabb_intersects(ba, bb, tol=0.05):
                    vol = _overlap_volume(ba, bb)
                    if vol > 0.005:
                        clashes.append({
                            "type": "Column-Column Clash",
                            "element_a": ba["name"],
                            "element_b": bb["name"],
                            "severity": "Critical",
                            "description": f"Columns '{ba['name']}' and '{bb['name']}' intersect (overlap ≈ {vol:.3f} m³)",
                        })

        # --- Beam–Beam clashes ---
        for i, (_, ba) in enumerate(beam_boxes):
            for _, bb in beam_boxes[i + 1:]:
                if _aabb_intersects(ba, bb, tol=0.05):
                    vol = _overlap_volume(ba, bb)
                    if vol > 0.005:
                        clashes.append({
                            "type": "Beam-Beam Clash",
                            "element_a": ba["name"],
                            "element_b": bb["name"],
                            "severity": "High",
                            "description": f"Beams '{ba['name']}' and '{bb['name']}' intersect (overlap ≈ {vol:.3f} m³)",
                        })

        # --- Beam–Slab deep penetration ---
        for _, bbeam in beam_boxes:
            for _, bslab in slab_boxes:
                if _aabb_intersects(bbeam, bslab, tol=0.15):
                    vol = _overlap_volume(bbeam, bslab)
                    if vol > 0.01:
                        clashes.append({
                            "type": "Beam-Slab Penetration",
                            "element_a": bbeam["name"],
                            "element_b": bslab["name"],
                            "severity": "High",
                            "description": f"Beam '{bbeam['name']}' penetrates slab '{bslab['name']}' (overlap ≈ {vol:.3f} m³)",
                        })

        # --- Column–Slab excess penetration ---
        for _, bcol in col_boxes:
            for _, bslab in slab_boxes:
                vol = _overlap_volume(bcol, bslab)
                if vol > 0.5:
                    clashes.append({
                        "type": "Column-Slab Excess Penetration",
                        "element_a": bcol["name"],
                        "element_b": bslab["name"],
                        "severity": "Medium",
                        "description": f"Column '{bcol['name']}' has excessive overlap with slab '{bslab['name']}' ({vol:.3f} m³)",
                    })

        # --- Wall height sanity check ---
        for _, bwall in wall_boxes[:30]:
            h = bwall["max"][1] - bwall["min"][1]
            if h < 1.5:
                warnings.append({
                    "type": "Low Wall Height",
                    "element": bwall["name"],
                    "severity": "Low",
                    "description": f"Wall '{bwall['name']}' height {h:.2f} m may be incorrect (expected ≥ 1.5 m)",
                })

        # --- Door placement check ---
        for _, bdoor in door_boxes[:20]:
            door_cx = (bdoor["min"][0] + bdoor["max"][0]) / 2
            door_cz = (bdoor["min"][2] + bdoor["max"][2]) / 2
            door_y = bdoor["min"][1]
            in_wall = any(
                bw["min"][0] - 0.3 <= door_cx <= bw["max"][0] + 0.3 and
                bw["min"][2] - 0.3 <= door_cz <= bw["max"][2] + 0.3 and
                abs(bw["min"][1] - door_y) < 1.0
                for _, bw in wall_boxes
            )
            if not in_wall:
                warnings.append({
                    "type": "Door Not in Wall",
                    "element": bdoor["name"],
                    "severity": "High",
                    "description": f"Door '{bdoor['name']}' does not appear to be placed within any wall",
                })

        # --- Cross-model clash detection (Model A structural vs Model B MEP/services) ---
        cross_model = False
        if file_bytes2:
            try:
                with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp2:
                    tmp2.write(file_bytes2)
                    path2 = tmp2.name
                ifc2 = ifcopenshell.open(path2)
                os.unlink(path2)

                mep_types = [
                    "IfcDuctSegment", "IfcPipeSegment", "IfcCableCarrierSegment",
                    "IfcFlowTerminal", "IfcFlowFitting", "IfcEquipmentElement",
                ]
                mep_elements: list = []
                for etype in mep_types:
                    mep_elements.extend(list(ifc2.by_type(etype))[:30])
                if not mep_elements:
                    for etype in ["IfcWall", "IfcSlab", "IfcColumn", "IfcBeam"]:
                        mep_elements.extend(list(ifc2.by_type(etype))[:20])

                mep_boxes = _boxes(mep_elements)
                structural = wall_boxes + col_boxes + beam_boxes + slab_boxes
                for _, bstruct in structural[:60]:
                    for _, bmep in mep_boxes:
                        if _aabb_intersects(bstruct, bmep, tol=0.02):
                            vol = _overlap_volume(bstruct, bmep)
                            if vol > 0.001:
                                clashes.append({
                                    "type": "Cross-Model Structural-MEP Clash",
                                    "element_a": f"[A] {bstruct['name']}",
                                    "element_b": f"[B] {bmep['name']}",
                                    "severity": "Critical",
                                    "description": (
                                        f"Structural '{bstruct['name']}' (Model A) clashes with "
                                        f"'{bmep['name']}' (Model B) — overlap ≈ {vol:.3f} m³"
                                    ),
                                })
                cross_model = True
            except Exception as e:
                logger.warning("Cross-model clash failed: %s", e)

        return {
            "success": True,
            "cross_model": cross_model,
            "total_clashes": len(clashes),
            "total_warnings": len(warnings),
            "clashes": clashes[:30],
            "warnings": warnings[:15],
            "summary": {
                "walls_checked": len(walls),
                "doors_checked": len(doors),
                "windows_checked": len(windows),
                "columns_checked": len(columns),
                "beams_checked": len(beams),
                "slabs_checked": len(slabs),
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Quantities ───────────────────────────────────────────────────────────────

def extract_quantities(file_bytes: bytes) -> dict:
    if not HAS_IFC:
        return {"success": False, "error": "ifcopenshell not installed"}
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        ifc = ifcopenshell.open(tmp_path)
        os.unlink(tmp_path)

        quantities = {
            "walls":   {"count": len(ifc.by_type("IfcWall")),    "unit": "elements"},
            "floors":  {"count": len(ifc.by_type("IfcSlab")),    "unit": "elements"},
            "doors":   {"count": len(ifc.by_type("IfcDoor")),    "unit": "elements"},
            "windows": {"count": len(ifc.by_type("IfcWindow")),  "unit": "elements"},
            "columns": {"count": len(ifc.by_type("IfcColumn")),  "unit": "elements"},
            "beams":   {"count": len(ifc.by_type("IfcBeam")),    "unit": "elements"},
            "spaces":  {"count": len(ifc.by_type("IfcSpace")),   "unit": "rooms"},
            "stairs":  {"count": len(ifc.by_type("IfcStair")),   "unit": "elements"},
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


# ─── Bill of Quantities ───────────────────────────────────────────────────────

def generate_boq(parsed: dict) -> dict:
    """Derive a Bill of Quantities from parsed IFC geometry data.

    Uses geometry-extracted elements when available; falls back to raw_counts
    (true IFC element counts) when geometry extraction produced nothing — ensuring
    the BOQ is always populated even for IFC files where placement extraction fails.
    """
    geometry = parsed.get("geometry", {})
    raw = parsed.get("raw_counts", {})
    items = []

    def _n(key: str) -> int:
        """Element count: prefer geometry list length, fall back to raw IFC count."""
        geo = len(geometry.get(key, []))
        return geo if geo > 0 else raw.get(key, 0)

    def _area(els: list, d0: int, d1: int) -> Optional[float]:
        if not els:
            return None
        total = sum(
            el["dimensions"][d0] * el["dimensions"][d1]
            for el in els if el.get("dimensions") and len(el["dimensions"]) > max(d0, d1)
        )
        return round(total, 2) if total else None

    wall_n = _n("walls")
    if wall_n:
        wall_els = geometry.get("walls", [])
        items.append({
            "category": "Structure",
            "item": "Walls",
            "description": "Structural and partition walls",
            "quantity": wall_n,
            "unit": "EA",
            "area_m2": _area(wall_els, 0, 1),
        })

    floor_n = _n("floors")
    if floor_n:
        floor_els = geometry.get("floors", [])
        items.append({
            "category": "Structure",
            "item": "Floor Slabs",
            "description": "Reinforced concrete floor slabs",
            "quantity": floor_n,
            "unit": "EA",
            "area_m2": _area(floor_els, 0, 2),
        })

    col_n = _n("columns")
    if col_n:
        items.append({
            "category": "Structure",
            "item": "Columns",
            "description": "Structural columns",
            "quantity": col_n,
            "unit": "EA",
        })

    beam_n = _n("beams")
    if beam_n:
        beam_els = geometry.get("beams", [])
        total_len = round(sum(
            el["dimensions"][0] for el in beam_els if el.get("dimensions")
        ), 2) if beam_els else None
        items.append({
            "category": "Structure",
            "item": "Beams",
            "description": "Structural beams",
            "quantity": beam_n,
            "unit": "EA",
            "length_m": total_len,
        })

    door_n = _n("doors")
    if door_n:
        door_els = geometry.get("doors", [])
        door_area = round(sum(
            el.get("width", 0.9) * el.get("height", 2.1) for el in door_els
        ), 2) if door_els else None
        items.append({
            "category": "Finishes",
            "item": "Doors",
            "description": "Door sets including frames and hardware",
            "quantity": door_n,
            "unit": "EA",
            "area_m2": door_area,
        })

    win_n = _n("windows")
    if win_n:
        win_els = geometry.get("windows", [])
        win_area = round(sum(
            el.get("width", 1.2) * el.get("height", 1.2) for el in win_els
        ), 2) if win_els else None
        items.append({
            "category": "Finishes",
            "item": "Windows",
            "description": "Window units including glazing and frames",
            "quantity": win_n,
            "unit": "EA",
            "area_m2": win_area,
        })

    roof_n = _n("roofs")
    if roof_n:
        items.append({
            "category": "Structure",
            "item": "Roof Elements",
            "description": "Roof structure and coverings",
            "quantity": roof_n,
            "unit": "EA",
        })

    stair_n = _n("stairs")
    if stair_n:
        items.append({
            "category": "Structure",
            "item": "Stairs",
            "description": "Staircase elements",
            "quantity": stair_n,
            "unit": "EA",
        })

    space_n = _n("spaces")
    if space_n:
        space_els = geometry.get("spaces", [])
        total_area = round(sum(el.get("area", 0) for el in space_els), 2) if space_els else None
        items.append({
            "category": "Areas",
            "item": "Spaces / Rooms",
            "description": "Net floor areas by room",
            "quantity": space_n,
            "unit": "EA",
            "total_area_m2": total_area,
        })

    raw_total = sum(raw.values()) if raw else 0
    return {
        "project_name": parsed.get("project_name", "Unknown"),
        "filename": parsed.get("filename", ""),
        "storeys": len(parsed.get("storeys", [])),
        "total_elements": parsed.get("total_elements", 0) or raw_total,
        "materials": parsed.get("materials", []),
        "items": items,
    }


# ─── IFC Model Diff ───────────────────────────────────────────────────────────

def diff_ifc_models(bytes1: bytes, filename1: str, bytes2: bytes, filename2: str) -> dict:
    """Compare two IFC files: return added, removed, and moved/resized elements."""
    if not HAS_IFC:
        return {"success": False, "error": "ifcopenshell not installed"}
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as t1:
            t1.write(bytes1); path1 = t1.name
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as t2:
            t2.write(bytes2); path2 = t2.name

        ifc1 = ifcopenshell.open(path1)
        ifc2 = ifcopenshell.open(path2)
        os.unlink(path1)
        os.unlink(path2)

        TRACKED = [
            "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
            "IfcBeam", "IfcDoor", "IfcWindow", "IfcStair", "IfcRoof",
        ]

        def _index(ifc):
            out = {}
            for etype in TRACKED:
                for el in ifc.by_type(etype):
                    geom = extract_element_geometry(el)
                    out[el.GlobalId] = {
                        "type": etype.replace("IfcWallStandardCase", "IfcWall"),
                        "name": el.Name or etype,
                        "position": geom["position"] if geom else None,
                        "dimensions": geom["dimensions"] if geom else None,
                    }
            return out

        idx1 = _index(ifc1)
        idx2 = _index(ifc2)
        ids1, ids2 = set(idx1), set(idx2)

        added = [{"id": g, **idx2[g]} for g in ids2 - ids1]
        removed = [{"id": g, **idx1[g]} for g in ids1 - ids2]

        modified = []
        for g in ids1 & ids2:
            e1, e2 = idx1[g], idx2[g]
            changes = []
            if e1["position"] and e2["position"]:
                dist = sum((a - b) ** 2 for a, b in zip(e1["position"], e2["position"])) ** 0.5
                if dist > 0.1:
                    changes.append(f"moved {dist:.2f} m")
            if e1["dimensions"] and e2["dimensions"]:
                if any(abs(a - b) > 0.05 for a, b in zip(e1["dimensions"], e2["dimensions"])):
                    changes.append("resized")
            if changes:
                modified.append({"id": g, **e2, "changes": changes})

        return {
            "success": True,
            "model_a": filename1,
            "model_b": filename2,
            "added": added[:50],
            "removed": removed[:50],
            "modified": modified[:50],
            "summary": {
                "added_count": len(added),
                "removed_count": len(removed),
                "modified_count": len(modified),
                "unchanged_count": len(ids1 & ids2) - len(modified),
                "total_model_a": len(idx1),
                "total_model_b": len(idx2),
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
