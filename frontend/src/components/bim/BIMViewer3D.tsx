"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
    walls: [], windows: [], columns: [], floors: [], roof: []
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
    walls: true, windows: true, columns: true, floors: true, roof: true,
  });

  const storeyCount = bimData?.storeys?.length || 4;
  const floorH = 3.5;

  const floorColors = [
    0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xef4444, 0x06b6d4
  ];

  const typeColors = {
    walls: 0x334155,
    windows: 0x3b82f6,
    columns: 0x475569,
    floors: 0x1e293b,
    roof: 0x0f172a,
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

    buildBuilding(scene);

    // Raycaster for click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onCanvasClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const allMeshes = Object.values(meshGroupsRef.current).flat();
      const intersects = raycaster.intersectObjects(allMeshes);
      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        const userData = mesh.userData;
        setSelectedElement(userData);
      } else {
        setSelectedElement(null);
      }
    };

    const canvas = renderer.domElement;
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
    const onMouseUp = () => {
      canvas.style.cursor = "grab";
    };
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

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const s = stateRef.current;
      if (s.isRotating && !s.isDragging) {
        s.angle += 0.004;
      }
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
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [bimData]);

  const buildBuilding = (scene: THREE.Scene) => {
    const bW = 14; const bD = 10;
    meshGroupsRef.current = { walls: [], windows: [], columns: [], floors: [], roof: [] };

    for (let f = 0; f < storeyCount; f++) {
      const y = f * floorH;
      const fc = floorColors[f % floorColors.length];

      // Floor
      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.6, 0.3, bD + 0.6),
        new THREE.MeshLambertMaterial({ color: typeColors.floors })
      );
      floorMesh.position.set(0, y, 0);
      floorMesh.receiveShadow = true;
      floorMesh.userData = { type: "floor", floor: f, name: `Floor Slab ${f + 1}`, width: `${bW}m`, depth: `${bD}m`, thickness: "300mm" };
      scene.add(floorMesh);
      meshGroupsRef.current.floors.push(floorMesh);

      // Walls
      [
        { w: bW, h: floorH, d: 0.3, x: 0, z: -bD / 2, side: "North" },
        { w: bW, h: floorH, d: 0.3, x: 0, z: bD / 2, side: "South" },
        { w: 0.3, h: floorH, d: bD, x: -bW / 2, z: 0, side: "West" },
        { w: 0.3, h: floorH, d: bD, x: bW / 2, z: 0, side: "East" },
      ].forEach((wall) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(wall.w, wall.h, wall.d),
          new THREE.MeshLambertMaterial({ color: typeColors.walls })
        );
        mesh.position.set(wall.x, y + floorH / 2, wall.z);
        mesh.castShadow = true;
        mesh.userData = { type: "wall", floor: f, name: `${wall.side} Wall F${f + 1}`, thickness: "300mm", height: `${floorH}m`, material: "Reinforced Concrete" };
        scene.add(mesh);
        meshGroupsRef.current.walls.push(mesh);
      });

      // Windows
      [-4, -1.5, 1.5, 4].forEach((wx, wi) => {
        [-bD / 2, bD / 2].forEach((wz, wzi) => {
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1.6, 0.4),
            new THREE.MeshLambertMaterial({ color: typeColors.windows, transparent: true, opacity: 0.5 })
          );
          win.position.set(wx, y + floorH / 2, wz);
          win.userData = { type: "window", floor: f, name: `Window F${f + 1}-${wi + 1}`, width: "2000mm", height: "1600mm", glazing: "Double" };
          scene.add(win);
          meshGroupsRef.current.windows.push(win);
        });
      });

      // Side windows
      [-2, 2].forEach((wz, wzi) => {
        [-bW / 2, bW / 2].forEach((wx) => {
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 1.6, 2),
            new THREE.MeshLambertMaterial({ color: typeColors.windows, transparent: true, opacity: 0.5 })
          );
          win.position.set(wx, y + floorH / 2, wz);
          win.userData = { type: "window", floor: f, name: `Side Window F${f + 1}`, width: "2000mm", height: "1600mm" };
          scene.add(win);
          meshGroupsRef.current.windows.push(win);
        });
      });

      // Columns
      [
        [-bW / 2, -bD / 2], [bW / 2, -bD / 2],
        [-bW / 2, bD / 2], [bW / 2, bD / 2],
        [0, -bD / 2], [0, bD / 2],
        [-bW / 2, 0], [bW / 2, 0],
      ].forEach(([cx, cz], ci) => {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, floorH, 0.6),
          new THREE.MeshLambertMaterial({ color: typeColors.columns })
        );
        col.position.set(cx, y + floorH / 2, cz);
        col.castShadow = true;
        col.userData = { type: "column", floor: f, name: `Column C${ci + 1} F${f + 1}`, size: "600x600mm", material: "Reinforced Concrete" };
        scene.add(col);
        meshGroupsRef.current.columns.push(col);
      });
    }

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 1.5, 0.6, bD + 1.5),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    roof.position.set(0, storeyCount * floorH + 0.3, 0);
    roof.userData = { type: "roof", name: "Roof Slab", thickness: "200mm" };
    scene.add(roof);
    meshGroupsRef.current.roof.push(roof);

    const roofEdge = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 2, 0.3, bD + 2),
      new THREE.MeshLambertMaterial({ color: 0x475569 })
    );
    roofEdge.position.set(0, storeyCount * floorH, 0);
    roofEdge.userData = { type: "roof", name: "Roof Parapet" };
    scene.add(roofEdge);
    meshGroupsRef.current.roof.push(roofEdge);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x0a0f1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    sceneRef.current?.add(ground);
  };

  // Apply color mode
  useEffect(() => {
    const groups = meshGroupsRef.current;
    Object.entries(groups).forEach(([type, meshes]) => {
      meshes.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        const floor = mesh.userData.floor ?? 0;

        if (colorMode === "byType") {
          mat.color.setHex(typeColors[type as keyof typeof typeColors] || 0x334155);
          mat.transparent = type === "windows";
          mat.opacity = type === "windows" ? 0.5 : 1;
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

    // Background
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(
        colorMode === "day" ? 0x93c5fd : 0x0f172a
      );
    }
  }, [colorMode]);

  // Apply display mode
  useEffect(() => {
    const groups = meshGroupsRef.current;
    Object.values(groups).flat().forEach((mesh) => {
      const floor = mesh.userData.floor ?? 0;
      const baseY = floor * floorH;

      if (displayMode === "exploded") {
        const explodeOffset = floor * 2;
        mesh.position.y = mesh.position.y - baseY + baseY + explodeOffset + (floor * 0.5);
      } else if (displayMode === "isolated") {
        mesh.visible = floor === isolatedFloor || mesh.userData.type === "roof";
        mesh.position.y = mesh.position.y;
      } else {
        // Normal
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

  // Camera presets
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

  const zoomToFit = () => {
    stateRef.current.radius = 45;
    stateRef.current.targetY = storeyCount * floorH / 2 + 10;
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
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
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

        {/* Floor Selector for Isolate */}
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

        {/* Camera Controls */}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={resetCamera}
            className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            ↺ Reset
          </button>
          <button
            onClick={zoomToFit}
            className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            ⊡ Fit
          </button>
          <button
            onClick={() => {
              stateRef.current.isRotating = !stateRef.current.isRotating;
              setIsRotating(stateRef.current.isRotating);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
              isRotating
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                : "bg-secondary text-muted-foreground border-border"
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

        {/* Current Mode Badge */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-2 border border-border">
            <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll zoom · Click element</p>
          </div>
          <div className="bg-secondary/80 backdrop-blur rounded-xl px-3 py-1.5 border border-border flex gap-2">
            <span className="text-xs text-blue-400 font-medium">View: {viewMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-purple-400 font-medium">Color: {colorMode}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-emerald-400 font-medium">{displayMode}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-secondary/80 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Elements</p>
          {[
            { color: "#334155", label: "Walls" },
            { color: "#3b82f6", label: "Windows" },
            { color: "#475569", label: "Columns" },
            { color: "#1e293b", label: "Floors" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">{storeyCount} Storeys</p>
            <p className="text-xs text-muted-foreground">14m × 10m</p>
          </div>
        </div>

        {/* Selected Element Panel */}
        {selectedElement && (
          <div className="absolute bottom-4 left-4 bg-secondary/90 backdrop-blur rounded-xl p-3 border border-blue-500/30 min-w-48">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-blue-400">Selected Element</p>
              <button
                onClick={() => setSelectedElement(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
            {Object.entries(selectedElement).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4">
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