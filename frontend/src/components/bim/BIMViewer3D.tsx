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
  const [realMeshes, setRealMeshes] = useState<any[]>([]);
  const [loadingIFC, setLoadingIFC] = useState(false);
  const [ifcFileName, setIfcFileName] = useState("");

  const storeyCount = bimData?.storeys?.length || 4;
  const floorH = 3.5;

  const floorColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xef4444, 0x06b6d4];
  const typeColors: { [key: string]: number } = {
    walls: 0x334155,
    windows: 0x3b82f6,
    columns: 0x475569,
    floors: 0x1e293b,
    roof: 0x0f172a,
    doors: 0xf59e0b,
    spaces: 0x8b5cf6,
  };

  const handleIFCFor3D = async (file: File) => {
    setLoadingIFC(true);
    setIfcFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("http://localhost:8000/api/v1/bim/parse-3d", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.meshes && data.meshes.length > 0) {
        setRealMeshes(data.meshes);
        setHasRealGeometry(true);
      } else {
        alert("No geometry found in IFC file. Try a different file.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to parse IFC file.");
    } finally {
      setLoadingIFC(false);
    }
  };

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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const blueLight = new THREE.PointLight(0x3b82f6, 0.8, 200);
    blueLight.position.set(-15, 15, -15);
    scene.add(blueLight);
    scene.add(new THREE.GridHelper(200, 50, 0x1e293b, 0x1e293b));

    if (realMeshes.length > 0) {
      buildFromRealMeshes(scene, realMeshes);
    } else {
      buildDefaultBuilding(scene);
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
      stateRef.current.targetY = Math.max(2, Math.min(100,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.15
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onMouseUp = () => { canvas.style.cursor = "grab"; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(5, Math.min(300,
        stateRef.current.radius + e.deltaY * 0.1
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
      camera.lookAt(0, s.targetY * 0.3, 0);
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
  }, [bimData, realMeshes]);

  const buildFromRealMeshes = (scene: THREE.Scene, meshes: any[]) => {
    meshGroupsRef.current = {
      walls: [], windows: [], columns: [], floors: [], roof: [], doors: [], spaces: []
    };

    // Calculate center for auto-positioning
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    meshes.forEach(meshData => {
      meshData.vertices?.forEach((v: number[]) => {
        minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
        minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
        minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
      });
    });

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const extentX = maxX - minX;
    const extentZ = maxZ - minZ;
    const maxExtent = Math.max(extentX, extentZ);

    // Auto-fit camera
    stateRef.current.radius = maxExtent * 1.2;
    stateRef.current.targetY = (maxY - minY) * 0.6;

    meshes.forEach(meshData => {
      try {
        if (!meshData.vertices || !meshData.faces || meshData.vertices.length === 0) return;

        const geometry = new THREE.BufferGeometry();

        // Center the model
        const centeredVerts: number[] = [];
        meshData.vertices.forEach((v: number[]) => {
          centeredVerts.push(v[0] - centerX, v[1], v[2] - centerZ);
        });

        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(centeredVerts), 3)
        );
        geometry.setIndex(
          new THREE.BufferAttribute(new Uint32Array(meshData.faces), 1)
        );
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
          color: new THREE.Color(meshData.color),
          transparent: meshData.transparent,
          opacity: meshData.opacity,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          type: meshData.type.replace("Ifc", "").toLowerCase(),
          name: meshData.name,
          floor: meshData.floor,
          id: meshData.id,
        };

        scene.add(mesh);

        const typeKey =
          meshData.type.includes("Wall") ? "walls" :
          meshData.type.includes("Slab") ? "floors" :
          meshData.type.includes("Column") ? "columns" :
          meshData.type.includes("Window") ? "windows" :
          meshData.type.includes("Door") ? "doors" :
          meshData.type.includes("Roof") ? "roof" :
          meshData.type.includes("Stair") ? "walls" : "walls";

        if (!meshGroupsRef.current[typeKey]) meshGroupsRef.current[typeKey] = [];
        meshGroupsRef.current[typeKey].push(mesh);

      } catch (e) {
        console.error("Mesh error:", e);
      }
    });

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxExtent * 4, maxExtent * 4),
      new THREE.MeshLambertMaterial({ color: 0x0a0f1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = minY - 0.1;
    ground.receiveShadow = true;
    scene.add(ground);
  };

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
          win.userData = { type: "window", floor: f, name: `Window F${f + 1}-${wi + 1}` };
          scene.add(win);
          meshGroupsRef.current.windows.push(win);
        });
      });

      [[-bW/2,-bD/2],[bW/2,-bD/2],[-bW/2,bD/2],[bW/2,bD/2],[0,-bD/2],[0,bD/2],[-bW/2,0],[bW/2,0]
      ].forEach(([cx, cz], ci) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, floorH, 0.6), columnMat);
        col.position.set(cx, y + floorH / 2, cz);
        col.castShadow = true;
        col.userData = { type: "column", floor: f, name: `Column C${ci + 1} F${f + 1}` };
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
          mat.color.setHex(typeColors[type] || 0x334155);
          mat.transparent = ["windows", "spaces"].includes(type);
          mat.opacity = type === "windows" ? 0.4 : type === "spaces" ? 0.1 : 1;
          mat.wireframe = false;
        } else if (colorMode === "byFloor") {
          mat.color.setHex(floorColors[floor % floorColors.length]);
          mat.transparent = false; mat.opacity = 1; mat.wireframe = false;
        } else if (colorMode === "xray") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = true;
          mat.opacity = type === "walls" ? 0.15 : 0.3;
          mat.wireframe = false;
        } else if (colorMode === "wireframe") {
          mat.color.setHex(0x3b82f6);
          mat.transparent = false; mat.opacity = 1; mat.wireframe = true;
        } else if (colorMode === "night") {
          mat.color.setHex(type === "windows" ? 0xfbbf24 : 0x1e293b);
          mat.transparent = type === "windows"; mat.opacity = type === "windows" ? 0.9 : 1;
          mat.wireframe = false;
        } else if (colorMode === "day") {
          mat.color.setHex(type === "windows" ? 0x93c5fd : 0xe2e8f0);
          mat.transparent = type === "windows"; mat.opacity = type === "windows" ? 0.6 : 1;
          mat.wireframe = false;
        }
        mat.needsUpdate = true;
      });
    });
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(colorMode === "day" ? 0x87ceeb : 0x0f172a);
    }
  }, [colorMode]);

  // Apply display mode
  useEffect(() => {
    Object.values(meshGroupsRef.current).flat().forEach((mesh) => {
      const floor = mesh.userData.floor ?? 0;
      if (displayMode === "exploded") {
        mesh.position.y += floor * 3;
      } else if (displayMode === "isolated") {
        mesh.visible = floor === isolatedFloor || mesh.userData.type === "roof";
      } else {
        mesh.visible = true;
      }
    });
  }, [displayMode, isolatedFloor]);

  // Apply show/hide
  useEffect(() => {
    Object.entries(showTypes).forEach(([type, visible]) => {
      (meshGroupsRef.current[type] || []).forEach(m => { m.visible = visible; });
    });
  }, [showTypes]);

  const setView = (view: ViewMode) => {
    setViewMode(view);
    stateRef.current.isRotating = false;
    setIsRotating(false);
    if (view === "top") {
      stateRef.current.angle = 0; stateRef.current.targetY = 100; stateRef.current.radius = 50;
    } else if (view === "front") {
      stateRef.current.angle = 0; stateRef.current.targetY = 20; stateRef.current.radius = 80;
    } else if (view === "side") {
      stateRef.current.angle = Math.PI / 2; stateRef.current.targetY = 20; stateRef.current.radius = 80;
    } else {
      stateRef.current.angle = Math.PI / 4; stateRef.current.targetY = 30; stateRef.current.radius = 55;
      stateRef.current.isRotating = true; setIsRotating(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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
          ] as { id: ColorMode; label: string }[]).map(c => (
            <button key={c.id} onClick={() => setColorMode(c.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${colorMode === c.id ? "bg-purple-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
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

        {displayMode === "isolated" && (
          <select value={isolatedFloor} onChange={(e) => setIsolatedFloor(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none">
            {Array.from({ length: storeyCount }, (_, i) => (
              <option key={i} value={i}>Floor {i + 1}</option>
            ))}
          </select>
        )}

        <div className="flex gap-1 ml-auto">
          <button onClick={() => { stateRef.current.angle = Math.PI/4; stateRef.current.radius=55; stateRef.current.targetY=30; stateRef.current.isRotating=true; setIsRotating(true); setViewMode("perspective"); }}
            className="px-3 py-1.5 rounded-xl bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border">↺ Reset</button>
          <button onClick={() => { stateRef.current.isRotating = !stateRef.current.isRotating; setIsRotating(stateRef.current.isRotating); }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${isRotating ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"}`}>
            {isRotating ? "⏸" : "▶"} Auto
          </button>
        </div>
      </div>

      {/* Show/Hide Types */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(showTypes).map(([type, visible]) => (
          <button key={type}
            onClick={() => setShowTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }))}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border capitalize ${visible ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary/50 text-muted-foreground border-border line-through"}`}>
            {type}
          </button>
        ))}
      </div>

      {/* IFC Upload Button */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <label className="cursor-pointer">
          <input type="file" className="hidden" accept=".ifc"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIFCFor3D(f); }} />
          <button
            onClick={(e) => (e.currentTarget.previousElementSibling as HTMLElement)?.click()}
            className="px-4 py-2 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
          >
            {loadingIFC ? "⏳ Processing..." : "📁 Load IFC → Real 3D"}
          </button>
        </label>
        {hasRealGeometry ? (
          <span className="text-xs text-emerald-400">✅ {ifcFileName} — {realMeshes.length} real meshes rendered</span>
        ) : (
          <span className="text-xs text-muted-foreground">Upload an IFC file to render real building geometry</span>
        )}
      </div>

      {/* 3D Viewer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "600px" }}>
        <div ref={mountRef} className="w-full h-full" />

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

        <div className="absolute top-4 right-4 bg-secondary/80 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">
            {hasRealGeometry ? `📐 ${ifcFileName}` : "🏢 Default Model"}
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
          {hasRealGeometry && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-emerald-400">{realMeshes.length} meshes</p>
              <p className="text-xs text-muted-foreground">{storeyCount} storeys</p>
            </div>
          )}
        </div>

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