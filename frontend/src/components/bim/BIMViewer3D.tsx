"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface BIMViewer3DProps {
  bimData?: any;
}

type ViewMode = "perspective" | "top" | "front" | "side";
type ColorMode = "byType" | "byFloor" | "xray" | "wireframe" | "night" | "day";
type DisplayMode = "normal" | "exploded" | "isolated";

export default function BIMViewer3D({ bimData }: BIMViewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshGroupsRef = useRef<{ [key: string]: THREE.Mesh[] }>({
    walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: []
  });
  const stateRef = useRef({
    isRotating: true,
    isDragging: false,
    angle: Math.PI / 4,
    radius: 55,
    targetY: 30,
    prevX: 0,
    prevY: 0,
  });

  const [isRotating, setIsRotating] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>("byType");
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("normal");
  const [isolatedFloor, setIsolatedFloor] = useState(0);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [showTypes, setShowTypes] = useState({
    walls: true, windows: true, columns: true, floors: true, roof: true, doors: true, spaces: false,
  });
  const [hasRealGeometry, setHasRealGeometry] = useState(false);

  const storeyCount = bimData?.storeys?.length || 4;
  const floorH = 3.5;

  const floorColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xef4444, 0x06b6d4];
  const typeColors = {
    walls: 0x334155,
    windows: 0x3b82f6,
    columns: 0x475569,
    floors: 0x1e293b,
    roof: 0x0f172a,
    doors: 0xf59e0b,
    spaces: 0x8b5cf620,
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 100, 250);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(40, 32, 40);
    camera.lookAt(0, 8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const blueLight = new THREE.PointLight(0x3b82f6, 0.8, 80);
    blueLight.position.set(-15, 15, -15);
    scene.add(blueLight);
    scene.add(new THREE.GridHelper(100, 50, 0x1e293b, 0x1e293b));

    // Build from real IFC geometry or fallback
    if (bimData?.geometry && bimData?.has_geometry) {
      setHasRealGeometry(true);
      buildFromIFCGeometry(scene, bimData.geometry, bimData.storeys);
    } else {
      setHasRealGeometry(false);
      buildDefaultBuilding(scene);
    }

    // Raycaster
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
      if (intersects.length > 0) setSelectedElement(intersects[0].object.userData);
      else setSelectedElement(null);
    };

    const onMouseDown = (e: MouseEvent) => {
      stateRef.current.isDragging = false;
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
      canvas.style.cursor = "grabbing";
    };
    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - stateRef.current.prevX);
      const dy = Math.abs(e.clientY - stateRef.current.prevY);
      if (dx > 3 || dy > 3) stateRef.current.isDragging = true;
      if (!stateRef.current.isDragging) return;
      stateRef.current.angle -= (e.clientX - stateRef.current.prevX) * 0.008;
      stateRef.current.targetY = Math.max(2, Math.min(70,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.15
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onMouseUp = () => { canvas.style.cursor = "grab"; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(10, Math.min(120,
        stateRef.current.radius + e.deltaY * 0.05
      ));
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
      camera.lookAt(0, 8, 0);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onCanvasClick);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [bimData]);

  // Build from real IFC geometry
  const buildFromIFCGeometry = (
    scene: THREE.Scene,
    geometry: any,
    storeys: any[]
  ) => {
    meshGroupsRef.current = {
      walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: []
    };

    const scale = 0.01; // IFC units are usually mm, convert to meters

    // Render walls
    geometry.walls?.forEach((wall: any) => {
      const [w, h, d] = wall.dimensions || [5, 2.8, 0.3];
      const [x, y, z] = wall.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.abs(w) * scale || 5,
          Math.abs(h) * scale || 2.8,
          Math.abs(d) * scale || 0.3
        ),
        new THREE.MeshLambertMaterial({ color: typeColors.walls })
      );
      mesh.position.set(x * scale, y * scale + (Math.abs(h) * scale) / 2, z * scale);
      mesh.rotation.y = wall.rotation || 0;
      mesh.userData = {
        type: "wall",
        name: wall.name,
        floor: wall.floor,
        material: wall.material,
        id: wall.id,
      };
      mesh.castShadow = true;
      scene.add(mesh);
      meshGroupsRef.current.walls.push(mesh);
    });

    // Render floors/slabs
    geometry.floors?.forEach((floor: any) => {
      const [w, h, d] = floor.dimensions || [10, 0.3, 8];
      const [x, y, z] = floor.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.abs(w) * scale || 10,
          Math.abs(h) * scale || 0.3,
          Math.abs(d) * scale || 8
        ),
        new THREE.MeshLambertMaterial({ color: typeColors.floors })
      );
      mesh.position.set(x * scale, y * scale, z * scale);
      mesh.userData = { type: "floor", name: floor.name, floor: floor.floor, id: floor.id };
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshGroupsRef.current.floors.push(mesh);
    });

    // Render columns
    geometry.columns?.forEach((col: any) => {
      const [w, h, d] = col.dimensions || [0.5, 2.8, 0.5];
      const [x, y, z] = col.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.abs(w) * scale || 0.5,
          Math.abs(h) * scale || 2.8,
          Math.abs(d) * scale || 0.5
        ),
        new THREE.MeshLambertMaterial({ color: typeColors.columns })
      );
      mesh.position.set(x * scale, y * scale + (Math.abs(h) * scale) / 2, z * scale);
      mesh.userData = { type: "column", name: col.name, floor: col.floor, id: col.id };
      mesh.castShadow = true;
      scene.add(mesh);
      meshGroupsRef.current.columns.push(mesh);
    });

    // Render doors
    geometry.doors?.forEach((door: any) => {
      const w = door.width || 0.9;
      const h = door.height || 2.1;
      const [x, y, z] = door.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w * scale || 0.9, h * scale || 2.1, 0.1),
        new THREE.MeshLambertMaterial({
          color: typeColors.doors, transparent: true, opacity: 0.8
        })
      );
      mesh.position.set(x * scale, y * scale + (h * scale) / 2, z * scale);
      mesh.rotation.y = door.rotation || 0;
      mesh.userData = {
        type: "door",
        name: door.name,
        floor: door.floor,
        width: `${w}m`,
        height: `${h}m`,
        id: door.id,
      };
      scene.add(mesh);
      meshGroupsRef.current.doors = meshGroupsRef.current.doors || [];
      meshGroupsRef.current.doors.push(mesh);
    });

    // Render windows
    geometry.windows?.forEach((win: any) => {
      const w = win.width || 1.2;
      const h = win.height || 1.2;
      const [x, y, z] = win.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w * scale || 1.2, h * scale || 1.2, 0.1),
        new THREE.MeshLambertMaterial({
          color: typeColors.windows, transparent: true, opacity: 0.4
        })
      );
      mesh.position.set(x * scale, y * scale + (h * scale) / 2, z * scale);
      mesh.rotation.y = win.rotation || 0;
      mesh.userData = {
        type: "window",
        name: win.name,
        floor: win.floor,
        width: `${w}m`,
        height: `${h}m`,
        id: win.id,
      };
      scene.add(mesh);
      meshGroupsRef.current.windows.push(mesh);
    });

    // Render spaces
    geometry.spaces?.forEach((space: any) => {
      const [w, h, d] = space.dimensions || [4, 2.8, 4];
      const [x, y, z] = space.position || [0, 0, 0];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.abs(w) * scale || 4,
          Math.abs(h) * scale || 2.8,
          Math.abs(d) * scale || 4
        ),
        new THREE.MeshLambertMaterial({
          color: 0x3b82f6, transparent: true, opacity: 0.1
        })
      );
      mesh.position.set(x * scale, y * scale + (Math.abs(h) * scale) / 2, z * scale);
      mesh.userData = {
        type: "space",
        name: space.name,
        floor: space.floor,
        area: `${space.area}m²`,
        id: space.id,
      };
      scene.add(mesh);
      meshGroupsRef.current.spaces = meshGroupsRef.current.spaces || [];
      meshGroupsRef.current.spaces.push(mesh);
    });

    // Ground
    addGround(scene);
    autoFitCamera(geometry);
  };

  // Auto-fit camera to model bounds
  const autoFitCamera = (geometry: any) => {
    const allPositions = [
      ...(geometry.walls || []),
      ...(geometry.floors || []),
      ...(geometry.columns || []),
    ].map((el: any) => el.position || [0, 0, 0]);

    if (allPositions.length === 0) return;
    const scale = 0.01;
    const xs = allPositions.map((p: number[]) => Math.abs(p[0] * scale));
    const zs = allPositions.map((p: number[]) => Math.abs(p[2] * scale));
    const maxExtent = Math.max(...xs, ...zs, 10);
    stateRef.current.radius = maxExtent * 2.5;
    stateRef.current.targetY = maxExtent * 1.2;
  };

  // Default building (no IFC)
  const buildDefaultBuilding = (scene: THREE.Scene) => {
    const bW = 14; const bD = 10;
    meshGroupsRef.current = {
      walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: []
    };

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const columnMat = new THREE.MeshLambertMaterial({ color: 0x475569 });

    for (let f = 0; f < storeyCount; f++) {
      const y = f * floorH;

      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.6, 0.3, bD + 0.6), floorMat
      );
      floorMesh.position.set(0, y, 0);
      floorMesh.receiveShadow = true;
      floorMesh.userData = { type: "floor", floor: f, name: `Floor Slab ${f + 1}` };
      scene.add(floorMesh);
      meshGroupsRef.current.floors.push(floorMesh);

      [
        { w: bW, h: floorH, d: 0.3, x: 0, z: -bD / 2, side: "North" },
        { w: bW, h: floorH, d: 0.3, x: 0, z: bD / 2, side: "South" },
        { w: 0.3, h: floorH, d: bD, x: -bW / 2, z: 0, side: "West" },
        { w: 0.3, h: floorH, d: bD, x: bW / 2, z: 0, side: "East" },
      ].forEach((wall) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wall.h, wall.d), wallMat);
        mesh.position.set(wall.x, y + floorH / 2, wall.z);
        mesh.castShadow = true;
        mesh.userData = { type: "wall", floor: f, name: `${wall.side} Wall F${f + 1}`, material: "Concrete" };
        scene.add(mesh);
        meshGroupsRef.current.walls.push(mesh);
      });

      [-4, -1.5, 1.5, 4].forEach((wx, wi) => {
        [-bD / 2, bD / 2].forEach((wz) => {
          const win = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 0.4), glassMat);
          win.position.set(wx, y + floorH / 2, wz);
          win.userData = { type: "window", floor: f, name: `Window F${f + 1}-${wi + 1}`, width: "2000mm", height: "1600mm" };
          scene.add(win);
          meshGroupsRef.current.windows.push(win);
        });
      });

      [[-bW / 2, -bD / 2], [bW / 2, -bD / 2], [-bW / 2, bD / 2], [bW / 2, bD / 2],
       [0, -bD / 2], [0, bD / 2], [-bW / 2, 0], [bW / 2, 0]
      ].forEach(([cx, cz], ci) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, floorH, 0.6), columnMat);
        col.position.set(cx, y + floorH / 2, cz);
        col.castShadow = true;
        col.userData = { type: "column", floor: f, name: `Column C${ci + 1} F${f + 1}`, size: "600x600mm" };
        scene.add(col);
        meshGroupsRef.current.columns.push(col);
      });
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 1.5, 0.6, bD + 1.5),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    roof.position.set(0, storeyCount * floorH + 0.3, 0);
    roof.userData = { type: "roof", name: "Roof Slab" };
    scene.add(roof);
    meshGroupsRef.current.roof.push(roof);

    addGround(scene);
  };

  const addGround = (scene: THREE.Scene) => {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x0a0f1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    scene.add(ground);
  };

  // Apply color mode
  useEffect(() => {
    Object.entries(meshGroupsRef.current).forEach(([type, meshes]) => {
      meshes.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        const floor = mesh.userData.floor ?? 0;

        if (colorMode === "byType") {
          mat.color.setHex(typeColors[type as keyof typeof typeColors] || 0x334155);
          mat.transparent = ["windows", "spaces"].includes(type);
          mat.opacity = type === "windows" ? 0.4 : type === "spaces" ? 0.1 : 1;
          mat.wireframe = false;
        } else if (colorMode === "byFloor") {
          mat.color.setHex(floorColors[floor % floorColors.length]);
          mat.transparent = false;
          mat.opacity = 1;
          mat.wireframe = false;
        } else if (colorMode === "xray") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = true;
          mat.opacity = type === "walls" ? 0.15 : 0.3;
          mat.wireframe = false;
        } else if (colorMode === "wireframe") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = false;
          mat.opacity = 1;
          mat.wireframe = true;
        } else if (colorMode === "night") {
          mat.color.setHex(type === "windows" ? 0xfbbf24 : 0x1e293b);
          mat.transparent = type === "windows";
          mat.opacity = type === "windows" ? 0.9 : 1;
          mat.wireframe = false;
        } else if (colorMode === "day") {
          mat.color.setHex(type === "windows" ? 0x93c5fd : 0xe2e8f0);
          mat.transparent = type === "windows";
          mat.opacity = type === "windows" ? 0.6 : 1;
          mat.wireframe = false;
        }
        mat.needsUpdate = true;
      });
    });

    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(colorMode === "day" ? 0x93c5fd : 0x0f172a);
    }
  }, [colorMode]);

  // Apply display mode
  useEffect(() => {
    Object.values(meshGroupsRef.current).flat().forEach((mesh) => {
      const floor = mesh.userData.floor ?? 0;
      const baseY = floor * floorH;

      if (displayMode === "exploded") {
        mesh.position.y += floor * 2;
      } else if (displayMode === "isolated") {
        mesh.visible = floor === isolatedFloor || mesh.userData.type === "roof";
      } else {
        mesh.visible = true;
      }
    });
  }, [displayMode, isolatedFloor]);

  // Apply show/hide types
  useEffect(() => {
    Object.entries(showTypes).forEach(([type, visible]) => {
      const meshes = meshGroupsRef.current[type] || [];
      meshes.forEach(m => { m.visible = visible; });
    });
  }, [showTypes]);

  const setView = (view: ViewMode) => {
    setViewMode(view);
    stateRef.current.isRotating = false;
    setIsRotating(false);
    if (view === "top") {
      stateRef.current.angle = 0;
      stateRef.current.targetY = 80;
      stateRef.current.radius = 30;
    } else if (view === "front") {
      stateRef.current.angle = 0;
      stateRef.current.targetY = 20;
      stateRef.current.radius = 50;
    } else if (view === "side") {
      stateRef.current.angle = Math.PI / 2;
      stateRef.current.targetY = 20;
      stateRef.current.radius = 50;
    } else {
      stateRef.current.angle = Math.PI / 4;
      stateRef.current.targetY = 30;
      stateRef.current.radius = 55;
      stateRef.current.isRotating = true;
      setIsRotating(true);
    }
  };

  const resetCamera = () => {
    stateRef.current.angle = Math.PI / 4;
    stateRef.current.radius = 55;
    stateRef.current.targetY = 30;
    stateRef.current.isRotating = true;
    setIsRotating(true);
    setViewMode("perspective");
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* View Mode */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {(["perspective", "top", "front", "side"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                viewMode === v ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "perspective" ? "3D" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Color Mode */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1 flex-wrap">
          {([
            { id: "byType", label: "Type" },
            { id: "byFloor", label: "Floor" },
            { id: "xray", label: "X-Ray" },
            { id: "wireframe", label: "Wire" },
            { id: "day", label: "Day" },
            { id: "night", label: "Night" },
          ] as { id: ColorMode; label: string }[]).map(c => (
            <button
              key={c.id}
              onClick={() => setColorMode(c.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                colorMode === c.id ? "bg-purple-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Display Mode */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {([
            { id: "normal", label: "Normal" },
            { id: "exploded", label: "Exploded" },
            { id: "isolated", label: "Isolate" },
          ] as { id: DisplayMode; label: string }[]).map(d => (
            <button
              key={d.id}
              onClick={() => setDisplayMode(d.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                displayMode === d.id ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {displayMode === "isolated" && (
          <select
            value={isolatedFloor}
            onChange={(e) => setIsolatedFloor(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
          >
            {Array.from({ length: storeyCount }, (_, i) => (
              <option key={i} value={i}>Floor {i + 1}</option>
            ))}
          </select>
        )}

        <div className="flex gap-1 ml-auto">
          <button onClick={resetCamera} className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border transition-colors">↺ Reset</button>
          <button
            onClick={() => {
              stateRef.current.radius = Math.max(20, stateRef.current.radius * 0.7);
            }}
            className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
          >⊡ Fit</button>
          <button
            onClick={() => {
              stateRef.current.isRotating = !stateRef.current.isRotating;
              setIsRotating(stateRef.current.isRotating);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
              isRotating ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {isRotating ? "⏸" : "▶"} Auto
          </button>
        </div>
      </div>

      {/* Show/Hide Types */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(showTypes).map(([type, visible]) => (
          <button
            key={type}
            onClick={() => setShowTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }))}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border capitalize ${
              visible
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                : "bg-secondary/50 text-muted-foreground border-border line-through"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* 3D Viewer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "600px" }}>
        <div ref={mountRef} className="w-full h-full" />

        {/* Mode Badge */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-2 border border-border">
            <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click element</p>
          </div>
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-1.5 border border-border flex gap-2 flex-wrap">
            <span className="text-xs text-blue-400 font-medium">View: {viewMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-purple-400 font-medium">Color: {colorMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-emerald-400 font-medium">{displayMode}</span>
          </div>
          {hasRealGeometry && (
            <div className="bg-emerald-500/10 backdrop-blur rounded-xl px-3 py-1.5 border border-emerald-500/20">
              <span className="text-xs text-emerald-400 font-medium">✅ Real IFC Geometry</span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-secondary/80 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">
            {hasRealGeometry ? "IFC Model" : "Default Model"}
          </p>
          {[
            { color: "#334155", label: "Walls" },
            { color: "#3b82f6", label: "Windows" },
            { color: "#475569", label: "Columns" },
            { color: "#1e293b", label: "Floors" },
            { color: "#f59e0b", label: "Doors" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
          {bimData && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">{storeyCount} Storeys</p>
              <p className="text-xs text-muted-foreground">{bimData.total_elements} Elements</p>
            </div>
          )}
        </div>

        {/* Selected Element Panel */}
        {selectedElement && (
          <div className="absolute bottom-4 left-4 bg-secondary/90 backdrop-blur rounded-xl p-3 border border-blue-500/30 min-w-48">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-blue-400">Selected Element</p>
              <button onClick={() => setSelectedElement(null)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            {Object.entries(selectedElement).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4 mb-1">
                <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                <span className="text-xs text-foreground">{String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}