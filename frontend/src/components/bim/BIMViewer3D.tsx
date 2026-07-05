"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

interface BIMViewer3DProps {
  bimData?: any;
  initialMeshes?: any[];
}

type ViewMode = "perspective" | "top" | "front" | "side";
type ColorMode = "byType" | "byFloor" | "xray" | "wireframe" | "night" | "day" | "byStatus";
type DisplayMode = "normal" | "exploded" | "isolated";
type ElementStatus = "pending" | "inprogress" | "complete";
interface Viewpoint {
  id: string;
  name: string;
  angle: number;
  radius: number;
  targetY: number;
  colorMode: ColorMode;
  displayMode: DisplayMode;
  isolatedFloor: number;
  showTypes: Record<string, boolean>;
  opacity: number;
}
const VIEWPOINTS_KEY = "civilai_bim_viewpoints";

const FLOOR_COLORS = [0x3b82f6, 0x10b981, 0xf59e0b, 0x14b8a6, 0xef4444, 0x06b6d4];
const TYPE_COLORS: { [key: string]: number } = {
  walls: 0x334155,
  windows: 0x3b82f6,
  columns: 0x475569,
  floors: 0x1e293b,
  roof: 0x0f172a,
  doors: 0xf59e0b,
  spaces: 0x14b8a6,
  beams: 0x64748b,
};
const STATUS_COLORS: Record<ElementStatus, number> = {
  pending: 0x374151,
  inprogress: 0xf59e0b,
  complete: 0x10b981,
};
const DEFAULT_SHOW_TYPES = {
  walls: true, windows: true, columns: true, floors: true,
  roof: true, doors: true, spaces: false, beams: true,
};

// ── Sun-path helper — maps a 0-24h slider to a real light position/color ────
function applySunPosition(dirLight: THREE.DirectionalLight, hour: number) {
  const hourAngle = ((hour - 12) / 12) * Math.PI; // -PI at 0h, 0 at noon, PI at 24h
  const elevation = Math.max(0.02, Math.cos(hourAngle)) * (Math.PI / 2 * 0.9);
  const radius = 60;
  const x = radius * Math.cos(elevation) * Math.sin(hourAngle);
  const z = radius * Math.cos(elevation) * Math.cos(hourAngle);
  const y = radius * Math.sin(elevation);
  dirLight.position.set(x, Math.max(2, y), z);

  const daylight = Math.max(0, Math.cos(hourAngle)); // 1 at noon, 0 at dawn/dusk
  dirLight.intensity = 0.25 + daylight * 0.9;
  // Warm at sunrise/sunset, neutral white near noon
  const warmth = 1 - daylight;
  dirLight.color.setRGB(1, 1 - warmth * 0.35, 1 - warmth * 0.65);
}

// ── Element info drawer helper — enriches raw userData with computed geometry ──
function describeMesh(mesh: THREE.Mesh) {
  mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;
  const size = new THREE.Vector3();
  bbox?.getSize(size);
  return {
    ...mesh.userData,
    width_m: size.x ? +size.x.toFixed(2) : undefined,
    height_m: size.y ? +size.y.toFixed(2) : undefined,
    depth_m: size.z ? +size.z.toFixed(2) : undefined,
  };
}

export default function BIMViewer3D({ bimData, initialMeshes }: BIMViewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshGroupsRef = useRef<{ [key: string]: THREE.Mesh[] }>({
    walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: [], beams: [],
  });
  const originalPositionsRef = useRef<Map<THREE.Mesh, number>>(new Map());

  // State mirrors → refs so imperative functions stay stable
  const displayModeRef = useRef<DisplayMode>("normal");
  const isolatedFloorRef = useRef(0);
  const showTypesRef = useRef({ ...DEFAULT_SHOW_TYPES });
  const colorModeRef = useRef<ColorMode>("byType");
  const elementStatusesRef = useRef<Record<string, ElementStatus>>({});
  const measureModeRef = useRef(false);
  const measurePointsRef = useRef<THREE.Vector3[]>([]);
  const measureLineRef = useRef<THREE.Line | null>(null);
  const sectionCutRef = useRef(false);
  const sectionElevRef = useRef(20);
  const is4DRef = useRef(false);
  const timeProgressRef = useRef(0);
  const play4DRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opacityRef = useRef(1);
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunStudyRef = useRef(false);
  const sunTimeRef = useRef(12);
  const boxSelectModeRef = useRef(false);
  const boxSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const boxRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const stateRef = useRef({
    isRotating: true,
    isDragging: false,
    angle: Math.PI / 4,
    radius: 55,
    targetY: 30,
    prevX: 0,
    prevY: 0,
  });

  // React state
  const [isRotating, setIsRotating] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>("byType");
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("normal");
  const [isolatedFloor, setIsolatedFloor] = useState(0);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [showTypes, setShowTypes] = useState({ ...DEFAULT_SHOW_TYPES });
  const [hasRealGeometry, setHasRealGeometry] = useState(false);
  const [realMeshes, setRealMeshes] = useState<any[]>([]);
  const [loadingIFC, setLoadingIFC] = useState(false);
  const [ifcFileName, setIfcFileName] = useState("");
  const [ifcError, setIfcError] = useState("");
  const [elementStatuses, setElementStatuses] = useState<Record<string, ElementStatus>>({});
  // Measurement
  const [measureMode, setMeasureMode] = useState(false);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [measureWaiting, setMeasureWaiting] = useState(false);
  // Section cut
  const [sectionCut, setSectionCut] = useState(false);
  const [sectionElevation, setSectionElevation] = useState(20);
  // 4D BIM
  const [is4D, setIs4D] = useState(false);
  const [timeProgress, setTimeProgress] = useState(0);
  const [isPlaying4D, setIsPlaying4D] = useState(false);
  // Opacity (scales whatever transparency the active color mode applies)
  const [opacity, setOpacity] = useState(1);
  // Sun-path / shadow study
  const [sunStudy, setSunStudy] = useState(false);
  const [sunTime, setSunTime] = useState(12);
  // Box select (multi-select for bulk actions)
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Search-and-fly
  const [searchQuery, setSearchQuery] = useState("");
  // Saved viewpoints
  const [viewpoints, setViewpoints] = useState<Viewpoint[]>([]);
  // Fullscreen
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const storeyCount = bimData?.storeys?.length || 4;
  const floorH = 3.5;

  // ── Apply display state (position + visibility) ──────────────────────────
  const applyDisplayState = useCallback(() => {
    if (is4DRef.current) return; // 4D mode controls its own visibility
    Object.entries(meshGroupsRef.current).forEach(([type, meshes]) => {
      meshes.forEach((mesh) => {
        const floor = mesh.userData.floor ?? 0;
        const id: string = mesh.userData.id || mesh.uuid;
        const origY = originalPositionsRef.current.get(mesh) ?? mesh.position.y;
        mesh.position.y = displayModeRef.current === "exploded" ? origY + floor * 3 : origY;
        const typeVisible = (showTypesRef.current as any)[type] !== false && !hiddenIdsRef.current.has(id);
        if (displayModeRef.current === "isolated") {
          mesh.visible = typeVisible && (floor === isolatedFloorRef.current || mesh.userData.type === "roof");
        } else {
          mesh.visible = typeVisible;
        }
      });
    });
  }, []);

  // ── Apply colour mode ────────────────────────────────────────────────────
  const applyColorMode = useCallback(() => {
    const cm = colorModeRef.current;
    Object.entries(meshGroupsRef.current).forEach(([type, meshes]) => {
      meshes.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        const floor = mesh.userData.floor ?? 0;
        const id: string = mesh.userData.id || mesh.uuid;

        if (cm === "byType") {
          mat.color.setHex(TYPE_COLORS[type] || 0x334155);
          mat.transparent = ["windows", "spaces"].includes(type);
          mat.opacity = type === "windows" ? 0.4 : type === "spaces" ? 0.1 : 1;
          mat.wireframe = false;
        } else if (cm === "byFloor") {
          mat.color.setHex(FLOOR_COLORS[floor % FLOOR_COLORS.length]);
          mat.transparent = false; mat.opacity = 1; mat.wireframe = false;
        } else if (cm === "xray") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = true;
          mat.opacity = type === "walls" ? 0.15 : 0.3;
          mat.wireframe = false;
        } else if (cm === "wireframe") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = false; mat.opacity = 1; mat.wireframe = true;
        } else if (cm === "night") {
          mat.color.setHex(type === "windows" ? 0xfbbf24 : 0x1e293b);
          mat.transparent = type === "windows"; mat.opacity = type === "windows" ? 0.9 : 1;
          mat.wireframe = false;
        } else if (cm === "day") {
          mat.color.setHex(type === "windows" ? 0x93c5fd : 0xe2e8f0);
          mat.transparent = type === "windows"; mat.opacity = type === "windows" ? 0.6 : 1;
          mat.wireframe = false;
        } else if (cm === "byStatus") {
          const status = elementStatusesRef.current[id] || "pending";
          mat.color.setHex(STATUS_COLORS[status]);
          mat.transparent = false; mat.opacity = 1; mat.wireframe = false;
        }
        mat.opacity *= opacityRef.current;
        mat.transparent = mat.transparent || opacityRef.current < 1;
        mat.needsUpdate = true;
      });
    });
    if (sceneRef.current) {
      const isDark = !["day"].includes(cm);
      sceneRef.current.background = new THREE.Color(cm === "day" ? 0x87ceeb : 0x0f172a);
    }
  }, []);

  // ── Adopt pre-loaded meshes from parent ───────────────────────────────────
  useEffect(() => {
    if (initialMeshes && initialMeshes.length > 0) {
      setRealMeshes(initialMeshes);
      setHasRealGeometry(true);
      setIfcError("");
    }
  }, [initialMeshes]);

  // ── Main scene setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 200, 600);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(40, 32, 40);
    camera.lookAt(0, 8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = false;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);
    dirLightRef.current = dirLight;
    if (sunStudyRef.current) applySunPosition(dirLight, sunTimeRef.current);
    const blueLight = new THREE.PointLight(0x3b82f6, 0.8, 200);
    blueLight.position.set(-15, 15, -15);
    scene.add(blueLight);
    scene.add(new THREE.GridHelper(200, 50, 0x1e293b, 0x1e293b));

    originalPositionsRef.current.clear();
    measureLineRef.current = null;

    if (realMeshes.length > 0) {
      buildFromRealMeshes(scene, realMeshes);
    } else {
      buildDefaultBuilding(scene, storeyCount, floorH);
    }

    applyDisplayState();
    applyColorMode();

    // Re-apply section cut if active
    if (sectionCutRef.current) {
      renderer.localClippingEnabled = true;
      const plane = [new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionElevRef.current)];
      Object.values(meshGroupsRef.current).flat().forEach(m => {
        (m.material as THREE.MeshLambertMaterial).clippingPlanes = plane;
      });
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const canvas = renderer.domElement;

    const onCanvasClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const allMeshes = Object.values(meshGroupsRef.current).flat();
      const intersects = raycaster.intersectObjects(allMeshes);

      // Measurement mode
      if (measureModeRef.current) {
        if (intersects.length > 0) {
          const pt = intersects[0].point.clone();
          const pts = measurePointsRef.current;
          if (pts.length === 0) {
            pts.push(pt);
            setMeasureWaiting(true);
            // Remove previous line
            if (measureLineRef.current) {
              scene.remove(measureLineRef.current);
              (measureLineRef.current as THREE.Line).geometry.dispose();
              measureLineRef.current = null;
            }
          } else {
            pts.push(pt);
            const dist = pts[0].distanceTo(pts[1]);
            setMeasureDistance(dist);
            setMeasureWaiting(false);
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
            const line = new THREE.Line(geo, mat);
            scene.add(line);
            measureLineRef.current = line;
            measurePointsRef.current = [];
          }
        }
        return;
      }

      // Status cycling in byStatus mode
      if (colorModeRef.current === "byStatus" && intersects.length > 0) {
        const obj = intersects[0].object as THREE.Mesh;
        const id: string = obj.userData.id || obj.uuid;
        setElementStatuses(prev => {
          const cur = prev[id] || "pending";
          const next: ElementStatus = cur === "pending" ? "inprogress" : cur === "inprogress" ? "complete" : "pending";
          return { ...prev, [id]: next };
        });
        return;
      }

      if (intersects.length > 0) setSelectedElement(describeMesh(intersects[0].object as THREE.Mesh));
      else setSelectedElement(null);
    };

    const onMouseDown = (e: MouseEvent) => {
      stateRef.current.isDragging = false;
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
      if (boxSelectModeRef.current) {
        const rect = canvas.getBoundingClientRect();
        boxSelectStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      canvas.style.cursor = boxSelectModeRef.current ? "crosshair" : "grabbing";
    };
    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - stateRef.current.prevX);
      const dy = Math.abs(e.clientY - stateRef.current.prevY);
      if (dx > 3 || dy > 3) stateRef.current.isDragging = true;

      if (boxSelectModeRef.current) {
        if (boxSelectStartRef.current) {
          const rect = canvas.getBoundingClientRect();
          const curX = e.clientX - rect.left, curY = e.clientY - rect.top;
          const s = boxSelectStartRef.current;
          const next = {
            x: Math.min(s.x, curX), y: Math.min(s.y, curY),
            w: Math.abs(curX - s.x), h: Math.abs(curY - s.y),
          };
          boxRectRef.current = next;
          setBoxRect(next);
        }
        return;
      }

      if (!stateRef.current.isDragging) return;
      stateRef.current.angle -= (e.clientX - stateRef.current.prevX) * 0.008;
      stateRef.current.targetY = Math.max(2, Math.min(100,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.15
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onMouseUp = () => {
      if (boxSelectModeRef.current && boxSelectStartRef.current) {
        const rect = boxRectRef.current;
        const canvasRect = canvas.getBoundingClientRect();
        if (rect && rect.w > 4 && rect.h > 4) {
          const newSelected = new Set<string>();
          Object.values(meshGroupsRef.current).flat().forEach(m => {
            if (!m.visible) return;
            const v = new THREE.Vector3();
            m.getWorldPosition(v);
            v.project(camera);
            const sx = (v.x * 0.5 + 0.5) * canvasRect.width;
            const sy = (-v.y * 0.5 + 0.5) * canvasRect.height;
            if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
              newSelected.add(m.userData.id || m.uuid);
            }
          });
          setSelectedIds(newSelected);
        }
        boxSelectStartRef.current = null;
        boxRectRef.current = null;
        setBoxRect(null);
      }
      stateRef.current.isDragging = false;
      canvas.style.cursor = boxSelectModeRef.current ? "crosshair" : "grab";
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(5, Math.min(300, stateRef.current.radius + e.deltaY * 0.1));
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onCanvasClick);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const s = stateRef.current;
      if (s.isRotating && !s.isDragging) s.angle += 0.004;
      camera.position.x = Math.sin(s.angle) * s.radius;
      camera.position.z = Math.cos(s.angle) * s.radius;
      camera.position.y = s.targetY;
      camera.lookAt(0, s.targetY * 0.3, 0);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onCanvasClick);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [bimData, realMeshes, storeyCount, applyDisplayState, applyColorMode]);

  // ── Sync effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    displayModeRef.current = displayMode;
    isolatedFloorRef.current = isolatedFloor;
    applyDisplayState();
  }, [displayMode, isolatedFloor, applyDisplayState]);

  useEffect(() => {
    showTypesRef.current = showTypes;
    applyDisplayState();
  }, [showTypes, applyDisplayState]);

  useEffect(() => {
    colorModeRef.current = colorMode;
    applyColorMode();
  }, [colorMode, applyColorMode]);

  useEffect(() => {
    elementStatusesRef.current = elementStatuses;
    if (colorModeRef.current === "byStatus") applyColorMode();
  }, [elementStatuses, applyColorMode]);

  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  useEffect(() => {
    opacityRef.current = opacity;
    applyColorMode();
  }, [opacity, applyColorMode]);

  useEffect(() => {
    hiddenIdsRef.current = hiddenIds;
    applyDisplayState();
  }, [hiddenIds, applyDisplayState]);

  useEffect(() => {
    boxSelectModeRef.current = boxSelectMode;
    if (!boxSelectMode) { setBoxRect(null); boxRectRef.current = null; boxSelectStartRef.current = null; }
  }, [boxSelectMode]);

  // ── Multi-select highlight ────────────────────────────────────────────────
  useEffect(() => {
    Object.values(meshGroupsRef.current).flat().forEach(m => {
      const mat = m.material as THREE.MeshLambertMaterial;
      const id: string = m.userData.id || m.uuid;
      if (mat.emissive) {
        mat.emissive.setHex(selectedIds.has(id) ? 0xfbbf24 : 0x000000);
        mat.emissiveIntensity = selectedIds.has(id) ? 0.6 : 1;
        mat.needsUpdate = true;
      }
    });
  }, [selectedIds]);

  // ── Sun-path / shadow study ───────────────────────────────────────────────
  useEffect(() => {
    sunStudyRef.current = sunStudy;
    sunTimeRef.current = sunTime;
    const dirLight = dirLightRef.current;
    if (!dirLight) return;
    if (sunStudy) {
      applySunPosition(dirLight, sunTime);
    } else {
      dirLight.position.set(20, 40, 20);
      dirLight.intensity = 0.8;
      dirLight.color.setRGB(1, 1, 1);
    }
  }, [sunStudy, sunTime]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Load saved viewpoints ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWPOINTS_KEY);
      if (raw) setViewpoints(JSON.parse(raw));
    } catch {}
  }, []);

  // ── Section cut ───────────────────────────────────────────────────────────
  useEffect(() => {
    sectionCutRef.current = sectionCut;
    sectionElevRef.current = sectionElevation;
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.localClippingEnabled = sectionCut;
    const plane = sectionCut ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionElevation)] : [];
    Object.values(meshGroupsRef.current).flat().forEach(m => {
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.clippingPlanes = plane;
      mat.needsUpdate = true;
    });
  }, [sectionCut, sectionElevation]);

  // ── 4D BIM ────────────────────────────────────────────────────────────────
  useEffect(() => {
    is4DRef.current = is4D;
    timeProgressRef.current = timeProgress;
    const allMeshes = Object.values(meshGroupsRef.current).flat();
    if (!is4D) {
      allMeshes.forEach(m => {
        const mat = m.material as THREE.MeshLambertMaterial;
        mat.transparent = false; mat.opacity = 1; mat.needsUpdate = true;
      });
      applyDisplayState();
      applyColorMode();
      return;
    }
    const total = Math.max(storeyCount, 1);
    allMeshes.forEach(m => {
      const floor = m.userData.floor ?? 0;
      const threshold = (floor / total) * 100;
      const bandEnd = ((floor + 1) / total) * 100;
      if (timeProgress < threshold) {
        m.visible = false;
      } else {
        m.visible = true;
        const progress = Math.min(1, (timeProgress - threshold) / Math.max(bandEnd - threshold, 1));
        const mat = m.material as THREE.MeshLambertMaterial;
        mat.transparent = progress < 0.99;
        mat.opacity = Math.min(1, progress * 1.5 + 0.1);
        mat.needsUpdate = true;
      }
    });
  }, [is4D, timeProgress, storeyCount, applyDisplayState, applyColorMode]);

  // ── 4D playback ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying4D) {
      play4DRef.current = setInterval(() => {
        setTimeProgress(p => {
          if (p >= 100) { setIsPlaying4D(false); return 100; }
          return p + 1;
        });
      }, 80);
    } else {
      if (play4DRef.current) { clearInterval(play4DRef.current); play4DRef.current = null; }
    }
    return () => { if (play4DRef.current) clearInterval(play4DRef.current); };
  }, [isPlaying4D]);

  // ── Geometry builders ─────────────────────────────────────────────────────
  const buildFromRealMeshes = (scene: THREE.Scene, meshes: any[]) => {
    meshGroupsRef.current = {
      walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: [], beams: [],
    };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    meshes.forEach(d => d.vertices?.forEach((v: number[]) => {
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    }));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const maxExtent = Math.max(maxX - minX, maxZ - minZ);
    stateRef.current.radius = maxExtent * 1.2;
    stateRef.current.targetY = (maxY - minY) * 0.6;

    meshes.forEach(d => {
      try {
        if (!d.vertices?.length || !d.faces?.length) return;
        const geo = new THREE.BufferGeometry();
        const verts: number[] = [];
        d.vertices.forEach((v: number[]) => verts.push(v[0] - cx, v[1], v[2] - cz));
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(d.faces), 1));
        geo.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(d.color),
          transparent: d.transparent, opacity: d.opacity, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData = { type: d.type.replace("Ifc", "").toLowerCase(), name: d.name, floor: d.floor, id: d.id };
        scene.add(mesh);
        originalPositionsRef.current.set(mesh, mesh.position.y);
        const key =
          d.type.includes("Wall") ? "walls" : d.type.includes("Slab") ? "floors" :
          d.type.includes("Column") ? "columns" : d.type.includes("Window") ? "windows" :
          d.type.includes("Door") ? "doors" : d.type.includes("Roof") ? "roof" :
          d.type.includes("Beam") ? "beams" : d.type.includes("Stair") ? "walls" : "walls";
        if (!meshGroupsRef.current[key]) meshGroupsRef.current[key] = [];
        meshGroupsRef.current[key].push(mesh);
      } catch {}
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxExtent * 4, maxExtent * 4),
      new THREE.MeshLambertMaterial({ color: 0x0a0f1a })
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = minY - 0.1; ground.receiveShadow = true;
    scene.add(ground);
  };

  const buildDefaultBuilding = (scene: THREE.Scene, floors: number, fH: number) => {
    const bW = 14, bD = 10;
    meshGroupsRef.current = {
      walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: [], beams: [],
    };
    const addMesh = (mesh: THREE.Mesh, type: string) => {
      scene.add(mesh);
      originalPositionsRef.current.set(mesh, mesh.position.y);
      if (meshGroupsRef.current[type]) meshGroupsRef.current[type].push(mesh);
    };

    for (let f = 0; f < floors; f++) {
      const y = f * fH;
      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.6, 0.3, bD + 0.6),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      floorMesh.position.set(0, y, 0); floorMesh.receiveShadow = true;
      floorMesh.userData = { type: "floor", floor: f, name: `Floor Slab ${f + 1}` };
      addMesh(floorMesh, "floors");

      [
        { w: bW, h: fH, d: 0.3, x: 0, z: -bD / 2, side: "North" },
        { w: bW, h: fH, d: 0.3, x: 0, z: bD / 2, side: "South" },
        { w: 0.3, h: fH, d: bD, x: -bW / 2, z: 0, side: "West" },
        { w: 0.3, h: fH, d: bD, x: bW / 2, z: 0, side: "East" },
      ].forEach((wall) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wall.h, wall.d), new THREE.MeshLambertMaterial({ color: 0x334155 }));
        m.position.set(wall.x, y + fH / 2, wall.z); m.castShadow = true;
        m.userData = { type: "wall", floor: f, name: `${wall.side} Wall F${f + 1}`, material: "Concrete" };
        addMesh(m, "walls");
      });

      [-4, -1.5, 1.5, 4].forEach((wx, wi) => {
        [-bD / 2, bD / 2].forEach((wz) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 }));
          m.position.set(wx, y + fH / 2, wz);
          m.userData = { type: "window", floor: f, name: `Window F${f + 1}-${wi + 1}` };
          addMesh(m, "windows");
        });
      });

      [[-bW/2,-bD/2],[bW/2,-bD/2],[-bW/2,bD/2],[bW/2,bD/2],[0,-bD/2],[0,bD/2],[-bW/2,0],[bW/2,0]].forEach(([cx, cz], ci) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, fH, 0.6), new THREE.MeshLambertMaterial({ color: 0x475569 }));
        m.position.set(cx, y + fH / 2, cz); m.castShadow = true;
        m.userData = { type: "column", floor: f, name: `Column C${ci + 1} F${f + 1}` };
        addMesh(m, "columns");
      });

      // Beams connecting columns along X-axis
      [[-bD/2],[0],[bD/2]].forEach(([bz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x64748b }));
        m.position.set(0, y + fH - 0.2, bz); m.castShadow = true;
        m.userData = { type: "beam", floor: f, name: `Beam F${f + 1}` };
        addMesh(m, "beams");
      });

      [{ x: 0, z: -bD / 2 }, { x: 0, z: bD / 2 }].forEach((pos, di) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
        m.position.set(pos.x, y + 1.2, pos.z);
        m.userData = { type: "door", floor: f, name: `Door ${di + 1} F${f + 1}` };
        addMesh(m, "doors");
      });
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(bW + 1.5, 0.6, bD + 1.5), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    roof.position.set(0, floors * fH + 0.3, 0);
    roof.userData = { type: "roof", name: "Roof Slab" };
    addMesh(roof, "roof");

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x0a0f1a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15; ground.receiveShadow = true;
    scene.add(ground);
  };

  // ── IFC upload (viewer-level) ─────────────────────────────────────────────
  const handleIFCFor3D = async (file: File) => {
    setLoadingIFC(true); setIfcFileName(file.name); setIfcError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/parse-3d`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.meshes?.length > 0) {
        setRealMeshes(data.meshes); setHasRealGeometry(true); setIfcError("");
      } else {
        setHasRealGeometry(false);
        setIfcError(data.error || data.detail || "No geometry found in this IFC file.");
      }
    } catch {
      setIfcError("Could not reach BIM server.");
    } finally {
      setLoadingIFC(false);
    }
  };

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleReset = () => {
    stateRef.current.angle = Math.PI / 4; stateRef.current.radius = 55;
    stateRef.current.targetY = 30; stateRef.current.isRotating = true;
    setIsRotating(true); setViewMode("perspective");
    setDisplayMode("normal"); setColorMode("byType");
    setShowTypes({ ...DEFAULT_SHOW_TYPES }); setIsolatedFloor(0); setSelectedElement(null);
    setMeasureMode(false); setMeasureDistance(null); setMeasureWaiting(false);
    setSectionCut(false); setSectionElevation(20);
    setIs4D(false); setTimeProgress(0); setIsPlaying4D(false);
    setElementStatuses({});
    setOpacity(1);
    setSunStudy(false); setSunTime(12);
    setBoxSelectMode(false); setSelectedIds(new Set()); setHiddenIds(new Set());
    setSearchQuery("");
    if (measureLineRef.current && sceneRef.current) {
      sceneRef.current.remove(measureLineRef.current);
      (measureLineRef.current as THREE.Line).geometry.dispose();
      measureLineRef.current = null;
    }
    measurePointsRef.current = [];
  };

  const handleToggleAuto = () => {
    const next = !stateRef.current.isRotating;
    stateRef.current.isRotating = next; setIsRotating(next);
  };

  const setView = (view: ViewMode) => {
    setViewMode(view);
    if (view === "perspective") {
      stateRef.current.angle = Math.PI / 4; stateRef.current.targetY = 30;
      stateRef.current.radius = 55; stateRef.current.isRotating = true; setIsRotating(true);
    } else {
      stateRef.current.isRotating = false; setIsRotating(false);
      if (view === "top") { stateRef.current.angle = 0; stateRef.current.targetY = 100; stateRef.current.radius = 50; }
      else if (view === "front") { stateRef.current.angle = 0; stateRef.current.targetY = 20; stateRef.current.radius = 80; }
      else if (view === "side") { stateRef.current.angle = Math.PI / 2; stateRef.current.targetY = 20; stateRef.current.radius = 80; }
    }
  };

  // ── Box-select bulk actions ────────────────────────────────────────────────
  const allMeshesFlat = () => Object.values(meshGroupsRef.current).flat();

  const handleBulkHide = () => {
    setHiddenIds(prev => { const next = new Set(prev); selectedIds.forEach(id => next.add(id)); return next; });
  };
  const handleBulkShow = () => {
    setHiddenIds(prev => { const next = new Set(prev); selectedIds.forEach(id => next.delete(id)); return next; });
  };
  const handleBulkStatus = (status: ElementStatus) => {
    setElementStatuses(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => { next[id] = status; });
      return next;
    });
  };
  const handleClearSelection = () => setSelectedIds(new Set());

  // ── Search-and-fly ─────────────────────────────────────────────────────────
  const searchResults = searchQuery.trim().length > 0
    ? allMeshesFlat().filter(m => {
        const q = searchQuery.toLowerCase();
        return String(m.userData.name || "").toLowerCase().includes(q) ||
          String(m.userData.id || "").toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  const handleFlyTo = (mesh: THREE.Mesh) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const targetPos = new THREE.Vector3();
    mesh.getWorldPosition(targetPos);
    stateRef.current.isRotating = false; setIsRotating(false);
    stateRef.current.angle = Math.atan2(targetPos.x, targetPos.z);
    stateRef.current.radius = Math.max(15, Math.min(120, Math.hypot(targetPos.x, targetPos.z) + 25));
    stateRef.current.targetY = Math.max(5, targetPos.y + 8);
    setSelectedElement(describeMesh(mesh));
    setSearchQuery("");

    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (mat.emissive) {
      const prevEmissive = mat.emissive.getHex();
      const prevIntensity = mat.emissiveIntensity;
      mat.emissive.setHex(0xfbbf24); mat.emissiveIntensity = 0.8; mat.needsUpdate = true;
      setTimeout(() => {
        mat.emissive.setHex(prevEmissive); mat.emissiveIntensity = prevIntensity; mat.needsUpdate = true;
      }, 1200);
    }
  };

  // ── Saved viewpoints ────────────────────────────────────────────────────────
  const persistViewpoints = (vps: Viewpoint[]) => {
    setViewpoints(vps);
    try { localStorage.setItem(VIEWPOINTS_KEY, JSON.stringify(vps)); } catch {}
  };

  const handleSaveViewpoint = () => {
    const name = window.prompt("Name this viewpoint:", `View ${viewpoints.length + 1}`);
    if (!name) return;
    const vp: Viewpoint = {
      id: `${Date.now()}`, name,
      angle: stateRef.current.angle, radius: stateRef.current.radius, targetY: stateRef.current.targetY,
      colorMode, displayMode, isolatedFloor, showTypes, opacity,
    };
    persistViewpoints([...viewpoints, vp]);
  };

  const handleRestoreViewpoint = (vp: Viewpoint) => {
    stateRef.current.angle = vp.angle; stateRef.current.radius = vp.radius; stateRef.current.targetY = vp.targetY;
    stateRef.current.isRotating = false; setIsRotating(false);
    setColorMode(vp.colorMode); setDisplayMode(vp.displayMode);
    setIsolatedFloor(vp.isolatedFloor); setShowTypes(vp.showTypes as typeof DEFAULT_SHOW_TYPES);
    setOpacity(vp.opacity ?? 1);
  };

  const handleDeleteViewpoint = (id: string) => {
    persistViewpoints(viewpoints.filter(v => v.id !== id));
  };

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const handleToggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) viewportRef.current.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ── Screenshot / model export ────────────────────────────────────────────────
  const handleScreenshotPNG = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const url = renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `${ifcFileName.replace(/\.[^.]+$/, "") || "bim-view"}.png`; a.click();
  };

  const buildExportGroup = () => {
    const group = new THREE.Group();
    allMeshesFlat().forEach(m => { if (m.visible) group.add(m.clone()); });
    return group;
  };

  const handleExportGLTF = async () => {
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const exporter = new GLTFExporter();
    const group = buildExportGroup();
    exporter.parse(
      group,
      (result) => {
        const isBinary = result instanceof ArrayBuffer;
        const blob = new Blob([isBinary ? result : JSON.stringify(result, null, 2)],
          { type: isBinary ? "application/octet-stream" : "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${ifcFileName.replace(/\.[^.]+$/, "") || "bim-model"}.gltf`; a.click();
        URL.revokeObjectURL(url);
      },
      (err: any) => console.error("glTF export failed:", err),
      { binary: false }
    );
  };

  const handleExportOBJ = async () => {
    const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
    const exporter = new OBJExporter();
    const group = buildExportGroup();
    const result = exporter.parse(group);
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${ifcFileName.replace(/\.[^.]+$/, "") || "bim-model"}.obj`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel: Record<ElementStatus, string> = { pending: "Not Started", inprogress: "In Progress", complete: "Complete" };
  const statusColor: Record<ElementStatus, string> = { pending: "text-slate-400", inprogress: "text-amber-400", complete: "text-emerald-400" };

  return (
    <div className="space-y-3">
      {/* ── View / Color / Display toolbar ─────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {(["perspective", "top", "front", "side"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${viewMode === v ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "perspective" ? "3D" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-secondary rounded-xl p-1 flex-wrap">
          {([
            { id: "byType", label: "Type" }, { id: "byFloor", label: "Floor" },
            { id: "xray", label: "X-Ray" }, { id: "wireframe", label: "Wire" },
            { id: "day", label: "Day" }, { id: "night", label: "Night" },
            { id: "byStatus", label: "Status" },
          ] as { id: ColorMode; label: string }[]).map(c => (
            <button key={c.id} onClick={() => setColorMode(c.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${colorMode === c.id ? "bg-cyan-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {([
            { id: "normal", label: "Normal" }, { id: "exploded", label: "Exploded" }, { id: "isolated", label: "Isolate" },
          ] as { id: DisplayMode; label: string }[]).map(d => (
            <button key={d.id} onClick={() => setDisplayMode(d.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${displayMode === d.id ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-1.5">
          <span className="text-xs text-muted-foreground shrink-0">Opacity</span>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity}
            onChange={e => setOpacity(parseFloat(e.target.value))}
            className="w-20 accent-cyan-400" />
          <span className="text-xs text-muted-foreground shrink-0 w-9 text-right">{Math.round(opacity * 100)}%</span>
        </div>

        {displayMode === "isolated" && (
          <select value={isolatedFloor} onChange={e => setIsolatedFloor(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none">
            {Array.from({ length: storeyCount }, (_, i) => (
              <option key={i} value={i}>Floor {i + 1}</option>
            ))}
          </select>
        )}

        <div className="flex gap-1 ml-auto">
          <button onClick={handleReset} className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">↺ Reset</button>
          <button onClick={handleToggleAuto}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${isRotating ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
            {isRotating ? "⏸" : "▶"} Auto
          </button>
          <button onClick={handleToggleFullscreen}
            className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">
            {isFullscreen ? "🗗 Exit" : "⛶ Fullscreen"}
          </button>
        </div>
      </div>

      {/* ── Search-and-fly ───────────────────────────────────────── */}
      <div className="relative">
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="🔍 Search element by name or ID…"
          className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40" />
        {searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-secondary border border-border rounded-xl overflow-hidden shadow-lg">
            {searchResults.map((m, i) => (
              <button key={i} onClick={() => handleFlyTo(m)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-blue-500/10 transition-colors border-b border-border last:border-0">
                <span className="text-foreground">{m.userData.name || "Unnamed"}</span>
                <span className="text-muted-foreground capitalize">{m.userData.type} · F{(m.userData.floor ?? 0) + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Type toggles ──────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(showTypes).map(([type, visible]) => (
          <button key={type}
            onClick={() => setShowTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }))}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border capitalize ${visible ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary/50 text-muted-foreground border-border line-through"}`}>
            {type}
          </button>
        ))}
      </div>

      {/* ── Tools row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Measure tool */}
        <button onClick={() => { setMeasureMode(m => !m); setMeasureDistance(null); setMeasureWaiting(false); measurePointsRef.current = []; }}
          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${measureMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
          📏 {measureMode ? "Measuring..." : "Measure"}
        </button>
        {measureMode && measureWaiting && <span className="text-xs text-amber-400">Click 2nd point</span>}
        {measureDistance !== null && (
          <span className="text-xs text-amber-300 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
            📐 {measureDistance.toFixed(3)} m
          </span>
        )}

        {/* Section cut */}
        <button onClick={() => setSectionCut(s => !s)}
          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${sectionCut ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
          ✂ Section Cut
        </button>

        {/* 4D BIM */}
        <button onClick={() => { setIs4D(d => !d); setTimeProgress(0); setIsPlaying4D(false); }}
          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${is4D ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
          🕐 4D BIM
        </button>

        {/* Sun study */}
        <button onClick={() => setSunStudy(s => !s)}
          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${sunStudy ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
          ☀ Sun Study
        </button>

        {/* Box select */}
        <button onClick={() => setBoxSelectMode(b => !b)}
          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${boxSelectMode ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
          ⬚ {boxSelectMode ? "Box Select: Drag to select" : "Box Select"}
        </button>

        {colorMode === "byStatus" && (
          <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/20">
            Click element to cycle status
          </span>
        )}
      </div>

      {/* ── Sun-path slider ───────────────────────────────────────── */}
      {sunStudy && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <span className="text-xs text-yellow-400 shrink-0">☀ Time of day</span>
          <input type="range" min={0} max={24} step={0.25} value={sunTime}
            onChange={e => setSunTime(parseFloat(e.target.value))}
            className="flex-1 accent-yellow-400" />
          <span className="text-xs text-yellow-300 shrink-0 w-16 text-right">
            {String(Math.floor(sunTime)).padStart(2, "0")}:{String(Math.round((sunTime % 1) * 60)).padStart(2, "0")}
          </span>
        </div>
      )}

      {/* ── Bulk selection actions ───────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex-wrap">
          <span className="text-xs text-blue-400 font-medium">{selectedIds.size} selected</span>
          <button onClick={handleBulkHide} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">Hide</button>
          <button onClick={handleBulkShow} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">Show</button>
          <button onClick={() => handleBulkStatus("pending")} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-slate-400 border border-border">Not Started</button>
          <button onClick={() => handleBulkStatus("inprogress")} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-amber-400 border border-border">In Progress</button>
          <button onClick={() => handleBulkStatus("complete")} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-emerald-400 border border-border">Complete</button>
          <button onClick={handleClearSelection} className="px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border ml-auto">Clear</button>
        </div>
      )}

      {/* ── Section cut slider ────────────────────────────────────── */}
      {sectionCut && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
          <span className="text-xs text-cyan-400 shrink-0">✂ Cut at</span>
          <input type="range" min={0} max={storeyCount * floorH + 5}
            value={sectionElevation} onChange={e => setSectionElevation(parseFloat(e.target.value))}
            step={0.5} className="flex-1 accent-cyan-400" />
          <span className="text-xs text-cyan-300 shrink-0 w-14 text-right">{sectionElevation.toFixed(1)} m</span>
        </div>
      )}

      {/* ── 4D timeline ───────────────────────────────────────────── */}
      {is4D && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <button onClick={() => setIsPlaying4D(p => !p)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium shrink-0">
            {isPlaying4D ? "⏸ Pause" : "▶ Play"}
          </button>
          <input type="range" min={0} max={100} value={timeProgress}
            onChange={e => setTimeProgress(parseInt(e.target.value))}
            className="flex-1 accent-amber-400" />
          <span className="text-xs text-amber-300 shrink-0 w-10 text-right">{timeProgress}%</span>
          <button onClick={() => { setTimeProgress(0); setIsPlaying4D(false); }}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0">↺</button>
        </div>
      )}

      {/* ── Status legend (byStatus mode) ────────────────────────── */}
      {colorMode === "byStatus" && (
        <div className="flex gap-3 p-2 rounded-xl bg-secondary/40 flex-wrap">
          {(["pending", "inprogress", "complete"] as ElementStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `#${STATUS_COLORS[s].toString(16).padStart(6, "0")}` }} />
              <span className={`text-xs ${statusColor[s]}`}>{statusLabel[s]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Saved viewpoints ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap p-2 rounded-xl bg-secondary/40">
        <button onClick={handleSaveViewpoint}
          className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border shrink-0">
          📌 Save View
        </button>
        {viewpoints.map(vp => (
          <div key={vp.id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl bg-secondary border border-border">
            <button onClick={() => handleRestoreViewpoint(vp)} className="text-xs text-blue-400 hover:text-blue-300">{vp.name}</button>
            <button onClick={() => handleDeleteViewpoint(vp.id)} className="w-5 h-5 rounded text-muted-foreground hover:text-red-400 text-xs">×</button>
          </div>
        ))}
        {viewpoints.length === 0 && <span className="text-xs text-muted-foreground">No saved viewpoints yet</span>}
      </div>

      {/* ── Export ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleScreenshotPNG} className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">📷 Screenshot PNG</button>
        <button onClick={handleExportGLTF} className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">⬇ Export glTF</button>
        <button onClick={handleExportOBJ} className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">⬇ Export OBJ</button>
      </div>

      {/* ── IFC upload ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".ifc"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleIFCFor3D(f); }} />
            <button onClick={e => (e.currentTarget.previousElementSibling as HTMLElement)?.click()}
              className="px-4 py-2 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors">
              {loadingIFC ? "⏳ Processing..." : "📁 Load IFC → Real 3D"}
            </button>
          </label>
          {hasRealGeometry
            ? <span className="text-xs text-emerald-400">✅ {ifcFileName} — {realMeshes.length} meshes</span>
            : <span className="text-xs text-muted-foreground">Upload an IFC file to render real building geometry</span>}
        </div>
        {ifcError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-1.5 border border-red-500/20">⚠ {ifcError}</p>}
      </div>

      {/* ── 3D Viewport ───────────────────────────────────────────── */}
      <div ref={viewportRef} className="relative w-full rounded-2xl overflow-hidden border border-border bg-[#0f172a]"
        style={{ height: isFullscreen ? "100vh" : "600px" }}>
        <div ref={mountRef} className="w-full h-full" />

        {/* Exit-fullscreen control (only reachable control while the browser is fullscreen) */}
        {isFullscreen && (
          <button onClick={handleToggleFullscreen}
            className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-xl bg-secondary/90 backdrop-blur text-xs text-foreground border border-border hover:bg-secondary">
            🗗 Exit Fullscreen
          </button>
        )}

        {/* Box-select rectangle overlay */}
        {boxSelectMode && boxRect && (
          <div className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none"
            style={{ left: boxRect.x, top: boxRect.y, width: boxRect.w, height: boxRect.h }} />
        )}

        {/* HUD top-left */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-2 border border-border">
            <p className="text-xs text-muted-foreground">
              {measureMode ? "🖱️ Click surface to measure" :
               boxSelectMode ? "🖱️ Drag to box-select elements" : "🖱️ Drag · Scroll · Click element"}
            </p>
          </div>
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-1.5 border border-border flex gap-2 flex-wrap">
            <span className="text-xs text-blue-400 font-medium">{viewMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-cyan-400 font-medium">{colorMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-emerald-400 font-medium">{displayMode}</span>
            {is4D && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-amber-400 font-medium">4D {timeProgress}%</span></>}
            {sectionCut && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-cyan-400 font-medium">cut@{sectionElevation.toFixed(0)}m</span></>}
            {sunStudy && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-yellow-400 font-medium">☀ {String(Math.floor(sunTime)).padStart(2, "0")}:{String(Math.round((sunTime % 1) * 60)).padStart(2, "0")}</span></>}
          </div>
          {hasRealGeometry && (
            <div className="bg-emerald-500/10 backdrop-blur rounded-xl px-3 py-1.5 border border-emerald-500/20">
              <span className="text-xs text-emerald-400 font-medium">✅ Real IFC Geometry</span>
            </div>
          )}
        </div>

        {/* Legend top-right */}
        <div className="absolute top-4 right-4 bg-secondary/80 backdrop-blur rounded-xl p-3 border border-border pointer-events-none">
          <p className="text-xs font-medium text-foreground mb-2">
            {hasRealGeometry ? `📐 ${ifcFileName}` : "🏢 Default Model"}
          </p>
          {colorMode === "byStatus" ? (
            (["pending", "inprogress", "complete"] as ElementStatus[]).map(s => (
              <div key={s} className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `#${STATUS_COLORS[s].toString(16).padStart(6, "0")}` }} />
                <span className={`text-xs ${statusColor[s]}`}>{statusLabel[s]}</span>
              </div>
            ))
          ) : (
            [
              { color: "#334155", label: "Walls" }, { color: "#3b82f6", label: "Windows" },
              { color: "#475569", label: "Columns" }, { color: "#64748b", label: "Beams" },
              { color: "#1e293b", label: "Floors" }, { color: "#f59e0b", label: "Doors" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </div>
            ))
          )}
          {hasRealGeometry && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-emerald-400">{realMeshes.length} meshes</p>
              <p className="text-xs text-muted-foreground">{storeyCount} storeys</p>
            </div>
          )}
        </div>

        {/* Selected element panel */}
        {selectedElement && colorMode !== "byStatus" && (
          <div className="absolute bottom-4 left-4 bg-secondary/90 backdrop-blur rounded-xl p-3 border border-blue-500/30 min-w-48">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-blue-400">Selected Element</p>
              <button onClick={() => setSelectedElement(null)} className="text-muted-foreground hover:text-foreground text-sm">×</button>
            </div>
            {Object.entries(selectedElement).filter(([, v]) => v !== undefined).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 mb-1">
                <span className="text-xs text-muted-foreground capitalize">{k.replace(/_m$/, " (m)")}:</span>
                <span className="text-xs text-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
