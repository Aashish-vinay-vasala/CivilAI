"""Generates 2 large, structurally-varied synthetic IFC models used as
selectable fallback/demo buildings when a project has no uploaded IFC.

These are proxy-level models (banded curtain walls instead of individual
mullions, tiered seating slabs instead of individual seats, doors/windows
placed in the wall plane rather than boolean-cut openings) — enough detail
to exercise the parsing/BOQ/clash/structural pipeline with large, varied
element counts, not architectural-fidelity models.

Regenerate the committed .ifc fixtures after editing this file:
    python backend/scripts/generate_fallback_models.py
"""

from dataclasses import dataclass, field
from math import radians, cos, sin
from typing import Optional

import numpy as np
import ifcopenshell
import ifcopenshell.api.project
import ifcopenshell.api.root
import ifcopenshell.api.context
import ifcopenshell.api.unit
import ifcopenshell.api.aggregate
import ifcopenshell.api.spatial
import ifcopenshell.api.geometry
import ifcopenshell.api.material
from ifcopenshell.util.shape_builder import ShapeBuilder


# ─── Bootstrapping ─────────────────────────────────────────────────────────

@dataclass
class BuildCtx:
    ifc: ifcopenshell.file
    builder: ShapeBuilder
    body_ctx: ifcopenshell.entity_instance
    project: ifcopenshell.entity_instance
    building: ifcopenshell.entity_instance
    storeys: dict = field(default_factory=dict)
    materials: dict = field(default_factory=dict)


def _init_project(project_name: str) -> BuildCtx:
    ifc = ifcopenshell.api.project.create_file(version="IFC4")
    project = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcProject", name=project_name)
    ifcopenshell.api.unit.assign_unit(ifc, length={"is_metric": True, "raw": "METERS"})
    model_ctx = ifcopenshell.api.context.add_context(ifc, context_type="Model")
    body_ctx = ifcopenshell.api.context.add_context(
        ifc, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model_ctx
    )
    site = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcBuilding", name=project_name)
    ifcopenshell.api.aggregate.assign_object(ifc, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(ifc, products=[building], relating_object=site)
    return BuildCtx(ifc=ifc, builder=ShapeBuilder(ifc), body_ctx=body_ctx, project=project, building=building)


def _add_storey(ctx: BuildCtx, index: int, elevation: float, name: Optional[str] = None):
    storey = ifcopenshell.api.root.create_entity(ctx.ifc, ifc_class="IfcBuildingStorey", name=name or f"Level {index}")
    storey.Elevation = elevation
    ifcopenshell.api.aggregate.assign_object(ctx.ifc, products=[storey], relating_object=ctx.building)
    ctx.storeys[index] = storey
    return storey


# ─── Placement helpers ─────────────────────────────────────────────────────

def _placement_matrix(x: float, y: float, z: float, yaw_rad: float = 0.0) -> np.ndarray:
    """4x4 world-space matrix: translation + yaw about the vertical (IFC) Z axis."""
    c, s = cos(yaw_rad), sin(yaw_rad)
    m = np.eye(4)
    m[0, 0], m[0, 1] = c, -s
    m[1, 0], m[1, 1] = s, c
    m[0, 3], m[1, 3], m[2, 3] = x, y, z
    return m


def _rotation_from_direction(z_axis: np.ndarray) -> tuple:
    """Build an orthonormal (x_axis, y_axis, z_axis) basis with z_axis as given direction."""
    z_axis = z_axis / np.linalg.norm(z_axis)
    hint = np.array([0.0, 0.0, 1.0]) if abs(z_axis[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    x_axis = hint - np.dot(hint, z_axis) * z_axis
    x_axis = x_axis / np.linalg.norm(x_axis)
    y_axis = np.cross(z_axis, x_axis)
    return x_axis, y_axis, z_axis


def _placement_matrix_from_axes(origin: np.ndarray, x_axis: np.ndarray, y_axis: np.ndarray, z_axis: np.ndarray) -> np.ndarray:
    m = np.eye(4)
    m[0:3, 0] = x_axis
    m[0:3, 1] = y_axis
    m[0:3, 2] = z_axis
    m[0:3, 3] = origin
    return m


# ─── Material ───────────────────────────────────────────────────────────────

def _assign_material(ctx: BuildCtx, element: ifcopenshell.entity_instance, material_name: str) -> None:
    mat = ctx.materials.get(material_name)
    if mat is None:
        mat = ifcopenshell.api.material.add_material(ctx.ifc, name=material_name)
        ctx.materials[material_name] = mat
    ifcopenshell.api.material.assign_material(ctx.ifc, products=[element], material=mat)


# ─── Generic element factory (walls/columns/slabs/beams/doors/windows/roofs/stairs) ─

def _extrude_box(ctx: BuildCtx, size_xyz: tuple) -> ifcopenshell.entity_instance:
    """Axis-aligned box: XY footprint (size[0] x size[1]) extruded up by size[2] along local +Z."""
    w, d, h = size_xyz
    profile = ctx.builder.rectangle(size=(w, d))
    return ctx.builder.extrude(profile, magnitude=h)


def _add_element(
    ctx: BuildCtx, storey_idx: int, ifc_class: str,
    position: tuple, size: tuple, rotation_deg: float = 0.0,
    predefined_type: Optional[str] = None, material: Optional[str] = None, name: Optional[str] = None,
) -> ifcopenshell.entity_instance:
    element = ifcopenshell.api.root.create_entity(ctx.ifc, ifc_class=ifc_class, predefined_type=predefined_type, name=name)
    solid = _extrude_box(ctx, size)
    rep = ctx.builder.get_representation(ctx.body_ctx, solid)
    ifcopenshell.api.geometry.assign_representation(ctx.ifc, product=element, representation=rep)
    matrix = _placement_matrix(*position, yaw_rad=radians(rotation_deg))
    ifcopenshell.api.geometry.edit_object_placement(ctx.ifc, product=element, matrix=matrix)
    ifcopenshell.api.spatial.assign_container(ctx.ifc, products=[element], relating_structure=ctx.storeys[storey_idx])
    if material:
        _assign_material(ctx, element, material)
    return element


def add_wall(ctx, storey_idx, x, y, z, length, height, thickness=0.25, rotation_deg=0.0, material="Concrete", name=None):
    return _add_element(ctx, storey_idx, "IfcWall", (x, y, z), (length, thickness, height),
                         rotation_deg, "SOLIDWALL", material, name or "Wall")


def add_column(ctx, storey_idx, x, y, z, width, depth, height, material="Reinforced Concrete", name=None):
    return _add_element(ctx, storey_idx, "IfcColumn", (x, y, z), (width, depth, height),
                         0.0, "COLUMN", material, name or "Column")


def add_slab(ctx, storey_idx, x, y, z, width, depth, thickness=0.25, material="Concrete", name=None):
    return _add_element(ctx, storey_idx, "IfcSlab", (x, y, z), (width, depth, thickness),
                         0.0, "FLOOR", material, name or "Floor Slab")


def add_beam(ctx, storey_idx, x, y, z, length, width=0.3, height=0.4, rotation_deg=0.0, material="Steel", name=None):
    return _add_element(ctx, storey_idx, "IfcBeam", (x, y, z), (length, width, height),
                         rotation_deg, "BEAM", material, name or "Beam")


def add_door(ctx, storey_idx, x, y, z, width=0.9, height=2.1, rotation_deg=0.0, material="Timber", name=None):
    return _add_element(ctx, storey_idx, "IfcDoor", (x, y, z), (width, 0.1, height),
                         rotation_deg, "DOOR", material, name or "Door")


def add_window(ctx, storey_idx, x, y, z, width=1.2, height=1.2, rotation_deg=0.0, material="Glass", name=None):
    return _add_element(ctx, storey_idx, "IfcWindow", (x, y, z), (width, 0.1, height),
                         rotation_deg, "WINDOW", material, name or "Window")


def add_roof(ctx, storey_idx, x, y, z, width, depth, thickness=0.3, material="Membrane Roofing", name=None):
    return _add_element(ctx, storey_idx, "IfcRoof", (x, y, z), (width, depth, thickness),
                         0.0, "FLAT_ROOF", material, name or "Roof")


def add_stair(ctx, storey_idx, x, y, z, width=1.5, run=4.0, rise=3.0, rotation_deg=0.0, material="Concrete", name=None):
    return _add_element(ctx, storey_idx, "IfcStair", (x, y, z), (run, width, rise),
                         rotation_deg, "STRAIGHT_RUN_STAIR", material, name or "Stair")


def add_member(ctx, storey_idx, p0, p1, width=0.2, depth=0.2,
                ifc_class="IfcMember", predefined_type="BRACE", material="Steel", name=None):
    """Straight member between two arbitrary 3D points — trusses, raked/radial columns,
    curved-wall approximation segments. Local +X of the cross-section maps to world
    vertical when the member itself is roughly horizontal (walls/chords); local +Y maps
    to horizontal-perpendicular. For near-vertical members (raked columns) the mapping
    rotates accordingly — cosmetic only, doesn't affect element validity or counts."""
    p0 = np.array(p0, dtype=float)
    p1 = np.array(p1, dtype=float)
    direction = p1 - p0
    length = float(np.linalg.norm(direction))
    if length < 1e-6:
        length, direction = 0.1, np.array([0.0, 0.0, 1.0])
    x_axis, y_axis, z_axis = _rotation_from_direction(direction / length)

    member = ifcopenshell.api.root.create_entity(ctx.ifc, ifc_class=ifc_class, predefined_type=predefined_type, name=name)
    profile = ctx.builder.rectangle(size=(width, depth))
    solid = ctx.builder.extrude(profile, magnitude=length)
    rep = ctx.builder.get_representation(ctx.body_ctx, solid)
    ifcopenshell.api.geometry.assign_representation(ctx.ifc, product=member, representation=rep)
    matrix = _placement_matrix_from_axes(p0, x_axis, y_axis, z_axis)
    ifcopenshell.api.geometry.edit_object_placement(ctx.ifc, product=member, matrix=matrix)
    ifcopenshell.api.spatial.assign_container(ctx.ifc, products=[member], relating_structure=ctx.storeys[storey_idx])
    if material:
        _assign_material(ctx, member, material)
    return member


# ─── Reusable parametric floor plate (office/residential/hospital-wing/podium) ──

def _tower_floor(
    ctx: BuildCtx, storey_idx: int, elev: float, floor_h: float,
    origin_xy: tuple, footprint: tuple,
    has_core: bool = True, window_bands_per_side: int = 2,
    has_door: bool = False, has_stair: bool = True,
    material_wall="Concrete", material_frame="Reinforced Concrete",
    material_window="Glass", name_prefix="Level",
) -> None:
    ox, oy = origin_xy
    fw, fd = footprint

    add_slab(ctx, storey_idx, ox, oy, elev, fw, fd, material="Concrete", name=f"{name_prefix} Slab")

    col_pts = [
        (ox + 1, oy + 1), (ox + fw / 2, oy + 1), (ox + fw - 1, oy + 1),
        (ox + 1, oy + fd - 1), (ox + fw / 2, oy + fd - 1), (ox + fw - 1, oy + fd - 1),
        (ox + 1, oy + fd / 2), (ox + fw - 1, oy + fd / 2),
    ]
    for cx, cy in col_pts:
        add_column(ctx, storey_idx, cx, cy, elev, 0.5, 0.5, floor_h, material=material_frame)

    if has_core:
        cw, cd = fw * 0.22, fd * 0.28
        cx0, cy0 = ox + fw / 2 - cw / 2, oy + fd / 2 - cd / 2
        add_wall(ctx, storey_idx, cx0, cy0, elev, cw, floor_h, 0.25, 0, material_wall, f"{name_prefix} Core Wall S")
        add_wall(ctx, storey_idx, cx0, cy0 + cd - 0.25, elev, cw, floor_h, 0.25, 0, material_wall, f"{name_prefix} Core Wall N")
        add_wall(ctx, storey_idx, cx0, cy0, elev, cd, floor_h, 0.25, 90, material_wall, f"{name_prefix} Core Wall W")
        add_wall(ctx, storey_idx, cx0 + cw - 0.25, cy0, elev, cd, floor_h, 0.25, 90, material_wall, f"{name_prefix} Core Wall E")

    add_beam(ctx, storey_idx, ox, oy, elev + floor_h - 0.1, fw, 0.3, 0.4, 0, material=material_frame, name=f"{name_prefix} Edge Beam S")
    add_beam(ctx, storey_idx, ox, oy + fd - 0.3, elev + floor_h - 0.1, fw, 0.3, 0.4, 0, material=material_frame, name=f"{name_prefix} Edge Beam N")
    add_beam(ctx, storey_idx, ox, oy, elev + floor_h - 0.1, fd, 0.3, 0.4, 90, material=material_frame, name=f"{name_prefix} Edge Beam W")
    add_beam(ctx, storey_idx, ox + fw - 0.3, oy, elev + floor_h - 0.1, fd, 0.3, 0.4, 90, material=material_frame, name=f"{name_prefix} Edge Beam E")

    sides = [(ox, oy, 0, fw), (ox, oy + fd - 0.15, 0, fw), (ox, oy, 90, fd), (ox + fw - 0.15, oy, 90, fd)]
    for sx, sy, rot, span in sides:
        for b in range(window_bands_per_side):
            t = (b + 0.5) / window_bands_per_side
            offset = t * span - 1.0
            wx, wy = (sx + offset, sy) if rot == 0 else (sx, sy + offset)
            add_window(ctx, storey_idx, wx, wy, elev + floor_h * 0.3, 2.0, floor_h * 0.5,
                       rotation_deg=rot, material=material_window, name=f"{name_prefix} Window")

    if has_door:
        add_door(ctx, storey_idx, ox + fw / 2 - 0.5, oy, elev, 1.0, 2.1, rotation_deg=0, name=f"{name_prefix} Entry Door")
    if has_stair:
        add_stair(ctx, storey_idx, ox + 2, oy + 2, elev, 1.5, 4.0, floor_h, material="Concrete", name=f"{name_prefix} Stair")


# ─── 1. Metro General Hospital — 8-storey, 3-wing complex ───────────────────

def generate_metro_general_hospital() -> ifcopenshell.file:
    ctx = _init_project("Metro General Hospital")
    storeys, floor_h = 8, 3.6
    wings = [
        {"origin": (0.0, 0.0), "footprint": (18.0, 14.0), "name": "Wing A Emergency"},
        {"origin": (30.0, 0.0), "footprint": (18.0, 14.0), "name": "Wing B Surgical"},
        {"origin": (15.0, 25.0), "footprint": (18.0, 14.0), "name": "Wing C Inpatient"},
    ]
    for i in range(storeys):
        elev = i * floor_h
        _add_storey(ctx, i, elev, name=f"Level {i + 1}")
        for w in wings:
            _tower_floor(ctx, i, elev, floor_h, w["origin"], w["footprint"],
                         has_core=True, window_bands_per_side=1,
                         has_door=(i == 0), has_stair=True, name_prefix=f"{w['name']} L{i + 1}")
        add_slab(ctx, i, 18, 5, elev, 12, 4, material="Concrete", name="Corridor A-B Slab")
        add_wall(ctx, i, 18, 5, elev, 12, floor_h, 0.2, 0, "Concrete", "Corridor A-B Wall")
        add_slab(ctx, i, 24, 14, elev, 5, 11, material="Concrete", name="Corridor B-C Slab")
        add_wall(ctx, i, 24, 14, elev, 5, floor_h, 0.2, 90, "Concrete", "Corridor B-C Wall")
    add_roof(ctx, storeys - 1, 0, 0, storeys * floor_h, 48, 39, material="Membrane Roofing")
    return ctx.ifc


# ─── 2. Riverside Residential Complex — 4 towers on a shared podium (largest) ─

def generate_riverside_residential_complex() -> ifcopenshell.file:
    ctx = _init_project("Riverside Residential Complex")
    podium_h, tower_h = 3.8, 3.0
    podium_storeys, tower_storeys = 2, 15
    tower_origins = [(0.0, 0.0), (28.0, 0.0), (0.0, 24.0), (28.0, 24.0)]
    footprint = (20.0, 16.0)

    idx = 0
    for p in range(podium_storeys):
        elev = p * podium_h
        _add_storey(ctx, idx, elev, name=f"Podium P{p + 1}")
        _tower_floor(ctx, idx, elev, podium_h, (-4, -4), (56, 44),
                     has_core=False, window_bands_per_side=1,
                     has_door=(p == 0), has_stair=False, name_prefix=f"Podium P{p + 1}")
        idx += 1

    base_elev = podium_storeys * podium_h
    for i in range(tower_storeys):
        elev = base_elev + i * tower_h
        _add_storey(ctx, idx, elev, name=f"Tower Level {i + 1}")
        for t, origin in enumerate(tower_origins):
            _tower_floor(ctx, idx, elev, tower_h, origin, footprint,
                         has_core=True, window_bands_per_side=2,
                         has_door=(i == 0), has_stair=True, name_prefix=f"Tower {t + 1} L{i + 1}")
        idx += 1

    top = base_elev + tower_storeys * tower_h
    for origin in tower_origins:
        add_roof(ctx, idx - 1, origin[0], origin[1], top, footprint[0], footprint[1], material="Membrane Roofing")
    return ctx.ifc


# ─── Registry ────────────────────────────────────────────────────────────────

FALLBACK_BUILDERS = {
    "metro-general-hospital": generate_metro_general_hospital,
    "riverside-residential-complex": generate_riverside_residential_complex,
}
