"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";

const furnitureTypes = [
  { id: "desk", label: "Desk", w: 1.6, h: 0.75, d: 0.8, color: 0x8b5cf6 },
  { id: "chair", label: "Chair", w: 0.6, h: 0.9, d: 0.6, color: 0x3b82f6 },
  { id: "table", label: "Table", w: 1.8, h: 0.75, d: 0.9, color: 0x10b981 },
  { id: "sofa", label: "Sofa", w: 2.2, h: 0.85, d: 0.9, color: 0xf59e0b },
  { id: "bed", label: "Bed", w: 2.0, h: 0.5, d: 1.6, color: 0xef4444 },
  { id: "wardrobe", label: "Wardrobe", w: 1.2, h: 2.2, d: 0.6, color: 0x64748b },
];

const initialFurniture = [
  { id: 1, type: "desk", x: -3, z: -2, rotation: 0 },
  { id: 2, type: "chair", x: -3, z: -1, rotation: 0 },
  { id: 3, type: "sofa", x: 1, z: 2, rotation: Math.PI },
  { id: 4, type: "table", x: 1, z: 0.5, rotation: 0 },
];

export default function SpacePlanning3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const furnitureMeshesRef = useRef<{ [id: number]: THREE.Mesh }>({});
  const stateRef = useRef({
    isRotating: false,
    isDragging: false,
    angle: Math.PI / 3,
    radius: 40,
    targetY: 25,
    prevX: 0,
    prevY: 0,
  });
  const [furniture, setFurniture] = useState(initialFurniture);
  const [selectedFurniture, setSelectedFurniture] = useState<any>(null);
  const [selectedType, setSelectedType] = useState("desk");
  const [roomWidth] = useState(8);
  const [roomDepth] = useState(7);
  const [isRotating, setIsRotating] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const sqM = (roomWidth * roomDepth).toFixed(1);
  const sqFt = (roomWidth * roomDepth * 10.764).toFixed(0);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    camera.position.set(25, 22, 25);
    camera.lookAt(0, 2, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    scene.add(dir);

    buildRoom(scene);
    buildFurniture(scene, furniture);

    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      stateRef.current.isDragging = false;
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (Math.abs(e.clientX - stateRef.current.prevX) > 3) stateRef.current.isDragging = true;
      if (!stateRef.current.isDragging) return;
      stateRef.current.angle -= (e.clientX - stateRef.current.prevX) * 0.008;
      stateRef.current.targetY = Math.max(5, Math.min(50, stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.1));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(10, Math.min(80, stateRef.current.radius + e.deltaY * 0.04));
    };
    const onClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes = Object.values(furnitureMeshesRef.current);
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) setSelectedFurniture(intersects[0].object.userData);
      else setSelectedFurniture(null);
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const s = stateRef.current;
      if (s.isRotating && !s.isDragging) s.angle += 0.004;
      camera.position.x = Math.sin(s.angle) * s.radius;
      camera.position.z = Math.cos(s.angle) * s.radius;
      camera.position.y = s.targetY;
      camera.lookAt(0, 2, 0);
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
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Rebuild furniture when list changes
  useEffect(() => {
    if (!sceneRef.current) return;
    // Remove old furniture
    Object.values(furnitureMeshesRef.current).forEach(mesh => {
      sceneRef.current!.remove(mesh);
    });
    furnitureMeshesRef.current = {};
    buildFurniture(sceneRef.current, furniture);
  }, [furniture]);

  const buildRoom = (scene: THREE.Scene) => {
    const h = 3;
    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomDepth),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const grid = new THREE.GridHelper(Math.max(roomWidth, roomDepth), Math.max(roomWidth, roomDepth), 0x334155, 0x334155);
    grid.position.y = 0.01;
    scene.add(grid);

    // Walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.4 });
    [
      [roomWidth, h, 0.1, 0, h / 2, -roomDepth / 2],
      [roomWidth, h, 0.1, 0, h / 2, roomDepth / 2],
      [0.1, h, roomDepth, -roomWidth / 2, h / 2, 0],
      [0.1, h, roomDepth, roomWidth / 2, h / 2, 0],
    ].forEach(([w, wh, d, x, y, z]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
      wall.position.set(x, y, z);
      scene.add(wall);
    });

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomDepth),
      new THREE.MeshLambertMaterial({ color: 0x0f172a, transparent: true, opacity: 0.3 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = h;
    scene.add(ceiling);

    // Dimension lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6 });
    const wLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-roomWidth / 2, 0.05, roomDepth / 2 + 0.5),
        new THREE.Vector3(roomWidth / 2, 0.05, roomDepth / 2 + 0.5),
      ]), lineMat
    );
    scene.add(wLine);
    const dLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(roomWidth / 2 + 0.5, 0.05, -roomDepth / 2),
        new THREE.Vector3(roomWidth / 2 + 0.5, 0.05, roomDepth / 2),
      ]), lineMat
    );
    scene.add(dLine);
  };

  const buildFurniture = (scene: THREE.Scene, furnitureList: typeof furniture) => {
    furnitureList.forEach(item => {
      const type = furnitureTypes.find(f => f.id === item.type);
      if (!type) return;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(type.w, type.h, type.d),
        new THREE.MeshLambertMaterial({ color: type.color, transparent: true, opacity: 0.85 })
      );
      mesh.position.set(item.x, type.h / 2, item.z);
      mesh.rotation.y = item.rotation;
      mesh.castShadow = true;
      mesh.userData = {
        id: item.id,
        type: item.type,
        label: type.label,
        dimensions: `${type.w}m × ${type.d}m`,
        height: `${type.h}m`,
      };
      scene.add(mesh);
      furnitureMeshesRef.current[item.id] = mesh;
    });
  };

  const addFurniture = () => {
    const type = furnitureTypes.find(f => f.id === selectedType);
    if (!type) return;
    const newItem = {
      id: Date.now(),
      type: selectedType,
      x: (Math.random() - 0.5) * (roomWidth - 2),
      z: (Math.random() - 0.5) * (roomDepth - 2),
      rotation: 0,
    };
    setFurniture(prev => [...prev, newItem]);
  };

  const removeFurniture = () => {
    if (!selectedFurniture) return;
    setFurniture(prev => prev.filter(f => f.id !== selectedFurniture.id));
    setSelectedFurniture(null);
  };

  const rotateFurniture = () => {
    if (!selectedFurniture) return;
    setFurniture(prev => prev.map(f =>
      f.id === selectedFurniture.id
        ? { ...f, rotation: f.rotation + Math.PI / 2 }
        : f
    ));
  };

  const clearRoom = () => {
    setFurniture([]);
    setSelectedFurniture(null);
  };

  const furnitureArea = furniture.reduce((sum, item) => {
    const type = furnitureTypes.find(f => f.id === item.type);
    return sum + (type ? type.w * type.d : 0);
  }, 0);
  const usagePercent = ((furnitureArea / (roomWidth * roomDepth)) * 100).toFixed(0);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
          >
            {furnitureTypes.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <button
            onClick={addFurniture}
            className="px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors"
          >
            + Add {furnitureTypes.find(f => f.id === selectedType)?.label}
          </button>
          {selectedFurniture && (
            <>
              <button
                onClick={rotateFurniture}
                className="px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium"
              >
                ↻ Rotate
              </button>
              <button
                onClick={removeFurniture}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium"
              >
                🗑 Remove
              </button>
            </>
          )}
          <button
            onClick={clearRoom}
            className="px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground border border-border text-xs"
          >
            Clear Room
          </button>
        </div>
        <div className="flex gap-3">
          <span className="text-xs text-muted-foreground">
            Room: <span className="text-foreground font-medium">{sqM}m² ({sqFt}ft²)</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Used: <span className={`font-medium ${parseInt(usagePercent) > 70 ? "text-orange-400" : "text-emerald-400"}`}>
              {usagePercent}%
            </span>
          </span>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "500px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click item</p>
        </div>

        {/* Furniture Colors */}
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Furniture</p>
          {furnitureTypes.map(f => (
            <div key={f.id} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `#${f.color.toString(16).padStart(6, "0")}` }} />
              <span className="text-xs text-muted-foreground">{f.label}</span>
            </div>
          ))}
        </div>

        {selectedFurniture && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl p-3 border border-blue-500/30">
            <p className="text-xs font-medium text-blue-400 mb-2">🪑 {selectedFurniture.label}</p>
            <p className="text-xs text-muted-foreground">Size: {selectedFurniture.dimensions}</p>
            <p className="text-xs text-muted-foreground">Height: {selectedFurniture.height}</p>
          </div>
        )}

        {/* Usage meter */}
        <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border w-36">
          <p className="text-xs text-muted-foreground mb-1">Space Usage</p>
          <div className="bg-secondary rounded-full h-2 mb-1">
            <div
              className={`h-2 rounded-full transition-all ${parseInt(usagePercent) > 70 ? "bg-orange-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(parseInt(usagePercent), 100)}%` }}
            />
          </div>
          <p className={`text-sm font-bold ${parseInt(usagePercent) > 70 ? "text-orange-400" : "text-emerald-400"}`}>
            {usagePercent}%
          </p>
        </div>
      </div>
    </div>
  );
}