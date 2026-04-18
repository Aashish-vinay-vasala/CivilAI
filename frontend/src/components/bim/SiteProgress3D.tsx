"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";
import axios from "axios";
import { Loader2 } from "lucide-react";

interface Task {
  id: string;
  task_name: string;
  planned_progress: number;
  actual_progress: number;
  status: string;
  delay_days: number;
  planned_start: string;
  planned_end: string;
}

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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<any>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);

  // Fallback data if no DB data
  const fallbackTasks: Task[] = [
    { id: "1", task_name: "Foundation", planned_progress: 100, actual_progress: 100, status: "done", delay_days: 0, planned_start: "2024-01-01", planned_end: "2024-03-31" },
    { id: "2", task_name: "Ground Floor Structure", planned_progress: 100, actual_progress: 85, status: "delayed", delay_days: 15, planned_start: "2024-04-01", planned_end: "2024-06-30" },
    { id: "3", task_name: "First Floor", planned_progress: 80, actual_progress: 60, status: "delayed", delay_days: 20, planned_start: "2024-07-01", planned_end: "2024-09-30" },
    { id: "4", task_name: "MEP Works", planned_progress: 60, actual_progress: 40, status: "delayed", delay_days: 30, planned_start: "2024-10-01", planned_end: "2025-01-31" },
    { id: "5", task_name: "Finishing", planned_progress: 30, actual_progress: 10, status: "atrisk", delay_days: 0, planned_start: "2025-02-01", planned_end: "2025-06-30" },
    { id: "6", task_name: "Handover", planned_progress: 0, actual_progress: 0, status: "pending", delay_days: 0, planned_start: "2025-07-01", planned_end: "2025-12-31" },
  ];

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projectId) fetchTasks();
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      setProjects(res.data.projects || []);
      if (res.data.projects?.length > 0) {
        setProjectId(res.data.projects[0].id);
      }
    } catch {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`);
      if (res.data.tasks?.length > 0) {
        setTasks(res.data.tasks);
      } else {
        setTasks(fallbackTasks);
      }
    } catch {
      setTasks(fallbackTasks);
    } finally {
      setLoading(false);
    }
  };

  const displayTasks = tasks.length > 0 ? tasks : fallbackTasks;

  const getProgressColor = (progress: number, status: string) => {
    if (status === "done" || progress >= 90) return 0x10b981;
    if (progress >= 50) return 0x3b82f6;
    if (progress >= 20) return 0xf59e0b;
    if (progress > 0) return 0xef4444;
    return 0x334155;
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
  }, [tasks, showBefore, loading]);

  const buildProgressModel = (scene: THREE.Scene) => {
    const bW = 14; const bD = 10; const floorH = 3.5;
    meshesRef.current = [];

    displayTasks.forEach((task, i) => {
      if (i === 0) {
        // Foundation
        const foundation = new THREE.Mesh(
          new THREE.BoxGeometry(bW + 2, 1, bD + 2),
          new THREE.MeshLambertMaterial({
            color: getProgressColor(task.actual_progress, task.status),
            transparent: true,
            opacity: 0.85,
          })
        );
        foundation.position.set(0, -0.5, 0);
        foundation.userData = {
          task: task.task_name,
          planned: task.planned_progress,
          actual: task.actual_progress,
          status: task.status,
          delay: task.delay_days,
          start: task.planned_start,
          end: task.planned_end,
        };
        scene.add(foundation);
        meshesRef.current.push(foundation);
        return;
      }

      const floor = i - 1;
      const y = floor * floorH;
      const progress = showBefore
        ? Math.max(0, task.actual_progress - 30)
        : task.actual_progress;
      const color = getProgressColor(progress, task.status);

      // Floor slab
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.5, 0.25, bD + 0.5),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      slab.position.set(0, y, 0);
      scene.add(slab);

      // Completed part
      if (progress > 0) {
        const completedW = (bW * progress) / 100;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(completedW, floorH - 0.2, bD),
          new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 })
        );
        mesh.position.set(-bW / 2 + completedW / 2, y + floorH / 2, 0);
        mesh.userData = {
          task: task.task_name,
          planned: task.planned_progress,
          actual: progress,
          status: task.status,
          delay: `${task.delay_days} days`,
          start: task.planned_start,
          end: task.planned_end,
        };
        mesh.castShadow = true;
        scene.add(mesh);
        meshesRef.current.push(mesh);
      }

      // Pending part
      if (progress < 100) {
        const pendingW = bW * (100 - progress) / 100;
        const pending = new THREE.Mesh(
          new THREE.BoxGeometry(pendingW, floorH - 0.2, bD),
          new THREE.MeshLambertMaterial({
            color: 0x1e293b, transparent: true, opacity: 0.3
          })
        );
        pending.position.set(bW / 2 - pendingW / 2, y + floorH / 2, 0);
        pending.userData = {
          task: task.task_name,
          planned: task.planned_progress,
          actual: progress,
          status: task.status,
          note: "Pending work",
        };
        scene.add(pending);
        meshesRef.current.push(pending);
      }

      // Columns
      [[-bW / 2, -bD / 2], [bW / 2, -bD / 2], [-bW / 2, bD / 2], [bW / 2, bD / 2]].forEach(([cx, cz]) => {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, floorH, 0.4),
          new THREE.MeshLambertMaterial({ color: 0x475569 })
        );
        col.position.set(cx, y + floorH / 2, cz);
        scene.add(col);
      });
    });

    // Tower crane
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 20, 0.3), craneMat);
    pole.position.set(bW / 2 + 3, 10, 0);
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 0.3), craneMat);
    arm.position.set(bW / 2 + 3 - 3, 20, 0);
    scene.add(arm);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x050d1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.1;
    scene.add(ground);
  };

  const overallProgress = Math.round(
    displayTasks.reduce((s, t) => s + t.actual_progress, 0) / displayTasks.length
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="ml-3 text-muted-foreground">Loading project data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Project Selector + Controls */}
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
            onClick={() => setShowBefore(!showBefore)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showBefore
                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {showBefore ? "📅 Before View" : "📅 Current View"}
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
        <div className="flex items-center gap-2">
          {tasks.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
              Live Supabase Data
            </span>
          )}
          <span className="text-xs px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
            Overall: {overallProgress}%
          </span>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ height: "500px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click phase</p>
        </div>

        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2">Progress Legend</p>
          {[
            { color: "#10b981", label: "Complete (≥90%)" },
            { color: "#3b82f6", label: "On Track (50-90%)" },
            { color: "#f59e0b", label: "Behind (20-50%)" },
            { color: "#ef4444", label: "Critical (<20%)" },
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
            <p className="text-xs font-medium text-blue-400 mb-2">📊 {selectedPhase.task}</p>
            {Object.entries(selectedPhase)
              .filter(([k]) => k !== "task")
              .map(([key, val]) => (
                <div key={key} className="flex justify-between gap-4 mb-1">
                  <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                  <span className="text-xs text-foreground">{String(val)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Task Progress Bars */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {displayTasks.map((task, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card border border-border rounded-xl p-3"
          >
            <div className="flex justify-between mb-2">
              <span className="text-xs font-medium text-foreground truncate">{task.task_name}</span>
              <span className="text-xs text-muted-foreground ml-2">{task.actual_progress}%</span>
            </div>
            <div className="bg-secondary rounded-full h-1.5 mb-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${task.actual_progress}%` }}
                transition={{ delay: i * 0.1, duration: 0.8 }}
                className="h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    task.actual_progress >= 90 ? "#10b981" :
                    task.actual_progress >= 50 ? "#3b82f6" :
                    task.actual_progress >= 20 ? "#f59e0b" :
                    task.actual_progress > 0 ? "#ef4444" : "#334155"
                }}
              />
            </div>
            <div className="flex justify-between">
              <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                task.status === "done" ? "bg-emerald-500/10 text-emerald-400" :
                task.status === "delayed" ? "bg-red-500/10 text-red-400" :
                task.status === "atrisk" ? "bg-orange-500/10 text-orange-400" :
                "bg-secondary text-muted-foreground"
              }`}>
                {task.status}
              </span>
              {task.delay_days > 0 && (
                <span className="text-xs text-red-400">{task.delay_days}d delay</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}