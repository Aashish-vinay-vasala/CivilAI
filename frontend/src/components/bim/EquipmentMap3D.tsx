"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";
import axios from "axios";
import { Loader2 } from "lucide-react";

interface Equipment {
  id: string;
  name: string;
  equipment_type: string;
  health_score: number;
  status: string;
  last_maintenance: string;
  next_service: string;
  operating_hours: number;
}

const fallbackEquipment: Equipment[] = [
  { id: "EQ1", name: "Tower Crane #1", equipment_type: "Crane", health_score: 92, status: "operational", last_maintenance: "2024-05-01", next_service: "2024-08-01", operating_hours: 2400 },
  { id: "EQ2", name: "Excavator #2", equipment_type: "Excavator", health_score: 65, status: "needs_service", last_maintenance: "2024-02-01", next_service: "2024-07-01", operating_hours: 5800 },
  { id: "EQ3", name: "Concrete Mixer", equipment_type: "Mixer", health_score: 78, status: "operational", last_maintenance: "2024-04-15", next_service: "2024-07-15", operating_hours: 3200 },
  { id: "EQ4", name: "Generator #3", equipment_type: "Generator", health_score: 45, status: "critical", last_maintenance: "2023-12-01", next_service: "2024-06-01", operating_hours: 8900 },
];

const equipmentPositions: { [key: string]: { x: number; z: number; floor: number } } = {
  "Crane": { x: 10, z: 0, floor: 4 },
  "Excavator": { x: -12, z: -8, floor: 0 },
  "Mixer": { x: -5, z: 4, floor: 1 },
  "Generator": { x: 14, z: 8, floor: 0 },
  "Bulldozer": { x: -18, z: 5, floor: 0 },
  "Elevator": { x: 0, z: -1, floor: 2 },
};

const maintenanceZones = [
  { x: 14, z: 8, radius: 4, label: "Maintenance Area", color: 0xf59e0b },
  { x: -12, z: -8, radius: 3, label: "Repair Zone", color: 0xef4444 },
];

export default function EquipmentMap3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const equipMeshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({
    isRotating: false,
    isDragging: false,
    angle: Math.PI / 6,
    radius: 65,
    targetY: 35,
    prevX: 0,
    prevY: 0,
  });

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEquip, setSelectedEquip] = useState<any>(null);
  const [showZones, setShowZones] = useState(true);
  const [isRotating, setIsRotating] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projectId) fetchEquipment();
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      setProjects(res.data.projects || []);
      if (res.data.projects?.length > 0) setProjectId(res.data.projects[0].id);
    } catch {
      setLoading(false);
    }
  };

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`);
      if (res.data.equipment?.length > 0) setEquipment(res.data.equipment);
      else setEquipment(fallbackEquipment);
    } catch {
      setEquipment(fallbackEquipment);
    } finally {
      setLoading(false);
    }
  };

  const displayEquipment = equipment.length > 0 ? equipment : fallbackEquipment;

  const getEquipmentColor = (status: string, health: number) => {
    if (status === "critical" || health < 50) return 0xef4444;
    if (status === "needs_service" || health < 70) return 0xf59e0b;
    return 0x10b981;
  };

  useEffect(() => {
    if (!mountRef.current || loading) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1628);
    scene.fog = new THREE.Fog(0x0a1628, 120, 300);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(50, 40, 50);
    camera.lookAt(0, 5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(30, 50, 30);
    dir.castShadow = true;
    scene.add(dir);
    scene.add(new THREE.GridHelper(150, 75, 0x1e293b, 0x1e293b));

    buildSiteMap(scene);

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
      stateRef.current.targetY = Math.max(5, Math.min(80,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.15
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(20, Math.min(120,
        stateRef.current.radius + e.deltaY * 0.05
      ));
    };
    const onClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(equipMeshesRef.current);
      if (intersects.length > 0) setSelectedEquip(intersects[0].object.userData);
      else setSelectedEquip(null);
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);

    let t = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      t += 0.01;
      const s = stateRef.current;
      if (s.isRotating && !s.isDragging) s.angle += 0.003;
      camera.position.x = Math.sin(s.angle) * s.radius;
      camera.position.z = Math.cos(s.angle) * s.radius;
      camera.position.y = s.targetY;
      camera.lookAt(0, 5, 0);

      equipMeshesRef.current.forEach((mesh, i) => {
        const status = mesh.userData.status;
        const mat = mesh.material as THREE.MeshLambertMaterial;
        if (status === "critical") {
          mat.emissiveIntensity = 0.3 + Math.sin(t * 4) * 0.3;
          mat.needsUpdate = true;
        } else if (status === "needs_service") {
          mat.emissiveIntensity = 0.1 + Math.sin(t * 2) * 0.15;
          mat.needsUpdate = true;
        }
      });

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
  }, [equipment, showZones, loading]);

  const buildSiteMap = (scene: THREE.Scene) => {
    equipMeshesRef.current = [];

    // Site boundary
    const site = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 40),
      new THREE.MeshLambertMaterial({ color: 0x0f2040, transparent: true, opacity: 0.5 })
    );
    site.rotation.x = -Math.PI / 2;
    site.position.y = 0.05;
    scene.add(site);

    // Building footprint
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(14, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.6 })
    );
    building.position.set(0, 7, 0);
    scene.add(building);

    // Maintenance zones
    if (showZones) {
      maintenanceZones.forEach(zone => {
        const circle = new THREE.Mesh(
          new THREE.CylinderGeometry(zone.radius, zone.radius, 0.2, 32),
          new THREE.MeshLambertMaterial({ color: zone.color, transparent: true, opacity: 0.2 })
        );
        circle.position.set(zone.x, 0.1, zone.z);
        scene.add(circle);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(zone.radius, 0.15, 8, 32),
          new THREE.MeshLambertMaterial({ color: zone.color, transparent: true, opacity: 0.6 })
        );
        ring.position.set(zone.x, 0.2, zone.z);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
      });
    }

    // Equipment from real data
    displayEquipment.forEach((eq, index) => {
      const color = getEquipmentColor(eq.status, eq.health_score);
      const emissive = eq.status === "critical" ? 0xef4444 : eq.status === "needs_service" ? 0xf59e0b : 0x000000;

      // Get position based on type or use index-based positioning
      const pos = equipmentPositions[eq.equipment_type] || {
        x: (index % 3 - 1) * 8 + Math.random() * 2,
        z: Math.floor(index / 3) * 8 - 8,
        floor: 0,
      };
      const y = pos.floor * 3.5 + 1.5;

      let geo: THREE.BufferGeometry;
      if (eq.equipment_type === "Crane") geo = new THREE.BoxGeometry(1.5, 8, 1.5);
      else if (eq.equipment_type === "Excavator" || eq.equipment_type === "Bulldozer") geo = new THREE.BoxGeometry(3, 2, 2.5);
      else geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);

      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.2 })
      );
      mesh.position.set(pos.x, y, pos.z);
      mesh.castShadow = true;
      mesh.userData = {
        type: "equipment",
        name: eq.name,
        equipType: eq.equipment_type,
        floor: pos.floor + 1,
        health: `${eq.health_score}%`,
        status: eq.status,
        lastService: eq.last_maintenance,
        nextService: eq.next_service,
        hours: `${eq.operating_hours}h`,
      };
      scene.add(mesh);
      equipMeshesRef.current.push(mesh);

      // Status ring
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.2, 0.1, 8, 24),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
      );
      ring.position.set(pos.x, 0.3, pos.z);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      // Health bar
      const healthW = (eq.health_score / 100) * 3;
      const healthMesh = new THREE.Mesh(
        new THREE.BoxGeometry(healthW, 0.2, 0.3),
        new THREE.MeshLambertMaterial({ color })
      );
      healthMesh.position.set(pos.x - 1.5 + healthW / 2, y + 2.5, pos.z);
      scene.add(healthMesh);
    });

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshLambertMaterial({ color: 0x050d1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="ml-3 text-muted-foreground">Loading equipment data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowZones(!showZones)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showZones ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            🔧 {showZones ? "Hide" : "Show"} Zones
          </button>
          <button
            onClick={() => {
              stateRef.current.isRotating = !stateRef.current.isRotating;
              setIsRotating(stateRef.current.isRotating);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
              isRotating ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {isRotating ? "⏸ Pause" : "▶ Rotate"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {equipment.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
              Live Supabase Data
            </span>
          )}
          <div className="flex gap-1">
            {displayEquipment.map(eq => (
              <div
                key={eq.id}
                className={`w-2 h-2 rounded-full ${
                  eq.status === "operational" ? "bg-emerald-400" :
                  eq.status === "needs_service" ? "bg-orange-400 animate-pulse" :
                  "bg-red-400 animate-pulse"
                }`}
                title={eq.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "500px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click equipment</p>
        </div>

        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Equipment Status</p>
          {[
            { color: "#10b981", label: "Operational" },
            { color: "#f59e0b", label: "Needs Service" },
            { color: "#ef4444", label: "Critical" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>

        {selectedEquip && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl p-3 border border-blue-500/30">
            <p className="text-xs font-medium text-blue-400 mb-2">🔧 {selectedEquip.name}</p>
            {Object.entries(selectedEquip).filter(([k]) => k !== "type").map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4 mb-1">
                <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                <span className={`text-xs font-medium ${
                  key === "status" && String(val) === "critical" ? "text-red-400" :
                  key === "status" && String(val) === "needs_service" ? "text-orange-400" :
                  key === "status" ? "text-emerald-400" : "text-foreground"
                }`}>{String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {displayEquipment.map((eq, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`bg-card border rounded-xl p-3 ${
              eq.status === "critical" ? "border-red-500/30" :
              eq.status === "needs_service" ? "border-orange-500/30" : "border-border"
            }`}
          >
            <div className="flex justify-between mb-2">
              <span className="text-xs font-medium text-foreground truncate">{eq.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                eq.status === "operational" ? "bg-emerald-500/10 text-emerald-400" :
                eq.status === "needs_service" ? "bg-orange-500/10 text-orange-400" :
                "bg-red-500/10 text-red-400"
              }`}>{eq.status}</span>
            </div>
            <div className="bg-secondary rounded-full h-1.5 mb-1">
              <div
                className={`h-1.5 rounded-full ${
                  eq.health_score >= 80 ? "bg-emerald-500" :
                  eq.health_score >= 60 ? "bg-orange-500" : "bg-red-500"
                }`}
                style={{ width: `${eq.health_score}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Health: {eq.health_score}%</span>
              <span className="text-xs text-muted-foreground">{eq.equipment_type}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}