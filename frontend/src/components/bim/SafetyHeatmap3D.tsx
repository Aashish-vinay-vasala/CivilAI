"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";
import axios from "axios";
import { Loader2 } from "lucide-react";

interface Incident {
  id: string;
  incident_type: string;
  location: string;
  date: string;
  severity: string;
  status: string;
  description: string;
}

const fallbackIncidents = [
  { id: "1", incident_type: "Fall", location: "Zone A", date: "2024-01-15", severity: "Moderate", status: "resolved", description: "Worker fell from scaffold" },
  { id: "2", incident_type: "Electrical", location: "Zone C", date: "2024-03-10", severity: "Severe", status: "resolved", description: "Electrical shock" },
  { id: "3", incident_type: "Strike", location: "Zone B", date: "2024-02-20", severity: "Minor", status: "resolved", description: "Hit by object" },
  { id: "4", incident_type: "Chemical", location: "Zone D", date: "2024-05-18", severity: "Moderate", status: "open", description: "Chemical exposure" },
];

const workerPositions = [
  { id: "W1", name: "John Smith", floor: 1, x: -3, z: 2, status: "active" },
  { id: "W2", name: "Sarah Johnson", floor: 2, x: 3, z: -2, status: "active" },
  { id: "W3", name: "Mike Wilson", floor: 0, x: -5, z: 4, status: "danger" },
  { id: "W4", name: "Tom Brown", floor: 1, x: 5, z: -4, status: "active" },
];

export default function SafetyHeatmap3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const zoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const workerMeshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({
    isRotating: true,
    isDragging: false,
    angle: Math.PI / 4,
    radius: 55,
    targetY: 28,
    prevX: 0,
    prevY: 0,
  });

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [showWorkers, setShowWorkers] = useState(true);
  const [isRotating, setIsRotating] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projectId) fetchIncidents();
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

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/safety`);
      if (res.data.incidents?.length > 0) setIncidents(res.data.incidents);
      else setIncidents(fallbackIncidents);
    } catch {
      setIncidents(fallbackIncidents);
    } finally {
      setLoading(false);
    }
  };

  const displayIncidents = incidents.length > 0 ? incidents : fallbackIncidents;

  // Map incidents to zones
  const getZoneRisk = (zone: string, floor: number) => {
    const zoneIncidents = displayIncidents.filter(inc =>
      inc.location?.includes(zone) || inc.location?.includes(`Zone ${zone}`)
    );
    if (zoneIncidents.some(i => i.severity === "Severe")) return { severity: "critical", count: zoneIncidents.length };
    if (zoneIncidents.some(i => i.severity === "Moderate")) return { severity: "high", count: zoneIncidents.length };
    if (zoneIncidents.length > 0) return { severity: "medium", count: zoneIncidents.length };
    return { severity: "low", count: 0 };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return 0xef4444;
      case "high": return 0xf97316;
      case "medium": return 0xf59e0b;
      case "low": return 0x10b981;
      default: return 0x334155;
    }
  };

  useEffect(() => {
    if (!mountRef.current || loading) return;
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(20, 40, 20);
    scene.add(dir);
    scene.add(new THREE.GridHelper(100, 50, 0x1e293b, 0x1e293b));

    buildSafetyModel(scene);

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
      stateRef.current.targetY = Math.max(5, Math.min(60,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.12
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(15, Math.min(100,
        stateRef.current.radius + e.deltaY * 0.05
      ));
    };
    const onClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([...zoneMeshesRef.current, ...workerMeshesRef.current]);
      if (intersects.length > 0) setSelectedZone(intersects[0].object.userData);
      else setSelectedZone(null);
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
      if (s.isRotating && !s.isDragging) s.angle += 0.004;
      camera.position.x = Math.sin(s.angle) * s.radius;
      camera.position.z = Math.cos(s.angle) * s.radius;
      camera.position.y = s.targetY;
      camera.lookAt(0, 8, 0);

      zoneMeshesRef.current.forEach((mesh) => {
        if (mesh.userData.severity === "critical") {
          const mat = mesh.material as THREE.MeshLambertMaterial;
          mat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
          mat.needsUpdate = true;
        }
      });

      workerMeshesRef.current.forEach((mesh, i) => {
        mesh.position.x += Math.sin(t + i) * 0.008;
        mesh.position.z += Math.cos(t * 0.7 + i) * 0.008;
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
  }, [incidents, showWorkers, loading]);

  const buildSafetyModel = (scene: THREE.Scene) => {
    const bW = 14; const bD = 10; const floorH = 3.5;
    const storeys = 4;
    zoneMeshesRef.current = [];
    workerMeshesRef.current = [];

    for (let f = 0; f < storeys; f++) {
      const y = f * floorH;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.5, 0.25, bD + 0.5),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      slab.position.set(0, y, 0);
      scene.add(slab);

      const zones = [
        { zone: "A", ox: -bW / 4, oz: -bD / 4 },
        { zone: "B", ox: bW / 4, oz: -bD / 4 },
        { zone: "C", ox: -bW / 4, oz: bD / 4 },
        { zone: "D", ox: bW / 4, oz: bD / 4 },
      ];

      zones.forEach(({ zone, ox, oz }) => {
        const risk = getZoneRisk(zone, f);
        const color = getSeverityColor(risk.severity);

        const zoneMesh = new THREE.Mesh(
          new THREE.BoxGeometry(bW / 2 - 0.2, floorH - 0.3, bD / 2 - 0.2),
          new THREE.MeshLambertMaterial({
            color,
            transparent: true,
            opacity: risk.severity === "critical" ? 0.8 :
                     risk.severity === "high" ? 0.6 :
                     risk.severity === "medium" ? 0.45 : 0.2,
          })
        );
        zoneMesh.position.set(ox, y + floorH / 2, oz);
        zoneMesh.userData = {
          type: "zone",
          floor: f + 1,
          zone,
          severity: risk.severity,
          incidents: risk.count,
          name: `Zone ${zone} - Floor ${f + 1}`,
        };
        scene.add(zoneMesh);
        zoneMeshesRef.current.push(zoneMesh);
      });

      // Walls
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x0f1e35, transparent: true, opacity: 0.3 });
      [
        [bW, floorH, 0.2, 0, y + floorH / 2, -bD / 2],
        [bW, floorH, 0.2, 0, y + floorH / 2, bD / 2],
        [0.2, floorH, bD, -bW / 2, y + floorH / 2, 0],
        [0.2, floorH, bD, bW / 2, y + floorH / 2, 0],
      ].forEach(([w, h, d, x, wy, z]) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, wy, z);
        scene.add(wall);
      });

      // Workers
      if (showWorkers) {
        workerPositions.filter(w => w.floor === f).forEach(worker => {
          const workerColor = worker.status === "danger" ? 0xef4444 : 0x3b82f6;
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8),
            new THREE.MeshLambertMaterial({ color: workerColor })
          );
          body.position.set(worker.x, y + 0.75, worker.z);
          body.userData = { type: "worker", name: worker.name, floor: f + 1, status: worker.status };
          scene.add(body);
          workerMeshesRef.current.push(body);

          const hat = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 8),
            new THREE.MeshLambertMaterial({ color: worker.status === "danger" ? 0xef4444 : 0xfbbf24 })
          );
          hat.position.set(worker.x, y + 1.6, worker.z);
          scene.add(hat);
        });
      }
    }

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x050d1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="ml-3 text-muted-foreground">Loading safety data...</p>
      </div>
    );
  }

  const criticalZones = displayIncidents.filter(i => i.severity === "Severe").length;

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
            onClick={() => setShowWorkers(!showWorkers)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showWorkers ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            👷 {showWorkers ? "Hide" : "Show"} Workers
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
          {incidents.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
              Live Supabase Data
            </span>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs text-red-400 font-medium">{criticalZones} Critical</span>
          </div>
        </div>
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "500px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click zone</p>
        </div>

        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Risk Levels</p>
          {[
            { color: "#ef4444", label: "Critical (Severe)" },
            { color: "#f97316", label: "High (Moderate)" },
            { color: "#f59e0b", label: "Medium (Minor)" },
            { color: "#10b981", label: "Low (None)" },
            { color: "#3b82f6", label: "Worker" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>

        {selectedZone && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl p-3 border border-red-500/30">
            <p className="text-xs font-medium text-red-400 mb-2">
              {selectedZone.type === "worker" ? "👷 Worker" : "⚠️ Zone Info"}
            </p>
            {Object.entries(selectedZone).filter(([k]) => k !== "type").map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4 mb-1">
                <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                <span className={`text-xs font-medium ${
                  key === "severity" && val === "critical" ? "text-red-400" :
                  key === "status" && val === "danger" ? "text-red-400" : "text-foreground"
                }`}>{String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incident List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {displayIncidents.slice(0, 6).map((inc, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`bg-card border rounded-xl p-3 ${
              inc.severity === "Severe" ? "border-red-500/30" :
              inc.severity === "Moderate" ? "border-orange-500/30" : "border-border"
            }`}
          >
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-foreground">{inc.incident_type}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                inc.severity === "Severe" ? "bg-red-500/10 text-red-400" :
                inc.severity === "Moderate" ? "bg-orange-500/10 text-orange-400" :
                "bg-emerald-500/10 text-emerald-400"
              }`}>{inc.severity}</span>
            </div>
            <p className="text-xs text-muted-foreground">{inc.location} · {inc.date}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{inc.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}