"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";

const progressData = [
  { phase: "Foundation", floor: -1, progress: 100, color: 0x10b981, startDate: "Jan 2024", endDate: "Mar 2024" },
  { phase: "Ground Floor", floor: 0, progress: 100, color: 0x10b981, startDate: "Mar 2024", endDate: "May 2024" },
  { phase: "First Floor", floor: 1, progress: 85, color: 0x3b82f6, startDate: "May 2024", endDate: "Jul 2024" },
  { phase: "Second Floor", floor: 2, progress: 45, color: 0xf59e0b, startDate: "Jul 2024", endDate: "Sep 2024" },
  { phase: "Third Floor", floor: 3, progress: 15, color: 0xef4444, startDate: "Sep 2024", endDate: "Nov 2024" },
  { phase: "Roof", floor: 4, progress: 0, color: 0x64748b, startDate: "Nov 2024", endDate: "Dec 2024" },
];

export default function SiteProgress3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({
    isRotating: true,
    isDragging: false,
    angle: Math.PI / 4,
    radius: 55,
    targetY: 25,
    prevX: 0,
    prevY: 0,
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<any>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [showBefore, setShowBefore] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1628);
    scene.fog = new THREE.Fog(0x0a1628, 100, 250);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(40, 30, 40);
    camera.lookAt(0, 8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    scene.add(dir);
    scene.add(new THREE.GridHelper(100, 50, 0x1e293b, 0x1e293b));

    buildProgressModel(scene);

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
      stateRef.current.targetY = Math.max(5, Math.min(60, stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.12));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(15, Math.min(100, stateRef.current.radius + e.deltaY * 0.05));
    };
    const onClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(meshesRef.current);
      if (intersects.length > 0) setSelectedPhase(intersects[0].object.userData);
      else setSelectedPhase(null);
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
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [showBefore]);

  const buildProgressModel = (scene: THREE.Scene) => {
    const bW = 14; const bD = 10; const floorH = 3.5;
    meshesRef.current = [];

    progressData.forEach((phase, i) => {
      if (i === 0) return; // Skip foundation visual

      const floor = i - 1;
      const y = floor * floorH;
      const progress = showBefore ? Math.max(0, phase.progress - 40) : phase.progress;
      const color = progress >= 90 ? 0x10b981 : progress >= 50 ? 0x3b82f6 : progress >= 20 ? 0xf59e0b : progress > 0 ? 0xef4444 : 0x334155;

      // Completed part
      if (progress > 0) {
        const completedW = (bW * progress) / 100;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(completedW, floorH - 0.2, bD),
          new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 })
        );
        mesh.position.set(-bW / 2 + completedW / 2, y + floorH / 2, 0);
        mesh.userData = { ...phase, progress, label: `${phase.phase}: ${progress}% complete` };
        mesh.castShadow = true;
        scene.add(mesh);
        meshesRef.current.push(mesh);
      }

      // Pending part
      if (progress < 100) {
        const pendingW = bW * (100 - progress) / 100;
        const pending = new THREE.Mesh(
          new THREE.BoxGeometry(pendingW, floorH - 0.2, bD),
          new THREE.MeshLambertMaterial({ color: 0x1e293b, transparent: true, opacity: 0.4, wireframe: false })
        );
        pending.position.set(bW / 2 - pendingW / 2, y + floorH / 2, 0);
        pending.userData = { ...phase, progress, label: `${phase.phase}: ${100 - progress}% pending` };
        scene.add(pending);
        meshesRef.current.push(pending);
      }

      // Floor slab
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.5, 0.25, bD + 0.5),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      slab.position.set(0, y, 0);
      scene.add(slab);

      // Progress label on side
      const columns = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, floorH, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x475569 })
      );
      columns.position.set(-bW / 2, y + floorH / 2, -bD / 2);
      scene.add(columns);
      const col2 = columns.clone();
      col2.position.set(bW / 2, y + floorH / 2, -bD / 2);
      scene.add(col2);
    });

    // Foundation
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 2, 1, bD + 2),
      new THREE.MeshLambertMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 })
    );
    foundation.position.set(0, -0.5, 0);
    foundation.userData = { phase: "Foundation", progress: 100, label: "Foundation: 100% complete" };
    scene.add(foundation);
    meshesRef.current.push(foundation);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x050d1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.1;
    scene.add(ground);

    // Cranes & equipment
    addSiteEquipment(scene, bW, bD);
  };

  const addSiteEquipment = (scene: THREE.Scene, bW: number, bD: number) => {
    // Tower crane
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
    const cranePole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 20, 0.3), craneMat);
    cranePole.position.set(bW / 2 + 3, 10, 0);
    scene.add(cranePole);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 0.3), craneMat);
    craneArm.position.set(bW / 2 + 3 - 2, 20, 0);
    scene.add(craneArm);

    // Scaffolding
    const scaffMat = new THREE.MeshLambertMaterial({ color: 0x475569, transparent: true, opacity: 0.5 });
    for (let y = 0; y < 4; y++) {
      const scaff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.5, bD), scaffMat);
      scaff.position.set(-bW / 2 - 0.5, y * 3.5 + 1.75, 0);
      scene.add(scaff);
    }
  };

  const animateConstruction = () => {
    setIsAnimating(true);
    // Simulate animation by toggling before/after
    setShowBefore(true);
    setTimeout(() => {
      setShowBefore(false);
      setIsAnimating(false);
    }, 2000);
  };

  const overallProgress = Math.round(progressData.reduce((s, p) => s + p.progress, 0) / progressData.length);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={animateConstruction}
            disabled={isAnimating}
            className="px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            {isAnimating ? "⏳ Animating..." : "▶ Animate Sequence"}
          </button>
          <button
            onClick={() => setShowBefore(!showBefore)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showBefore
                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {showBefore ? "📅 Before" : "📅 Current"} View
          </button>
          <button
            onClick={() => {
              stateRef.current.isRotating = !stateRef.current.isRotating;
              setIsRotating(stateRef.current.isRotating);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
              isRotating
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {isRotating ? "⏸ Pause" : "▶ Rotate"}
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <span className="text-xs text-blue-400 font-medium">Overall Progress: {overallProgress}%</span>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "500px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click phase</p>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Progress Legend</p>
          {[
            { color: "#10b981", label: "Complete (90-100%)" },
            { color: "#3b82f6", label: "On Track (50-90%)" },
            { color: "#f59e0b", label: "Behind (20-50%)" },
            { color: "#ef4444", label: "Critical (< 20%)" },
            { color: "#334155", label: "Not Started" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>

        {selectedPhase && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl p-3 border border-blue-500/30">
            <p className="text-xs font-medium text-blue-400 mb-2">📊 {selectedPhase.phase}</p>
            <p className="text-xs text-foreground">Progress: {selectedPhase.progress}%</p>
            <p className="text-xs text-muted-foreground">Start: {selectedPhase.startDate}</p>
            <p className="text-xs text-muted-foreground">End: {selectedPhase.endDate}</p>
          </div>
        )}
      </div>

      {/* Phase Progress Bars */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {progressData.map((phase, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card border border-border rounded-xl p-3"
          >
            <div className="flex justify-between mb-2">
              <span className="text-xs font-medium text-foreground">{phase.phase}</span>
              <span className="text-xs text-muted-foreground">{phase.progress}%</span>
            </div>
            <div className="bg-secondary rounded-full h-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${phase.progress}%` }}
                transition={{ delay: i * 0.1, duration: 0.8 }}
                className="h-1.5 rounded-full"
                style={{ backgroundColor: `#${phase.color.toString(16).padStart(6, "0")}` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">{phase.startDate}</span>
              <span className="text-xs text-muted-foreground">{phase.endDate}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}