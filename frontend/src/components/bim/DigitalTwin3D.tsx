"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";

interface SensorData {
  floor: number;
  zone: string;
  temperature: number;
  occupancy: number;
  humidity: number;
  co2: number;
  alert: boolean;
}

interface EquipmentMarker {
  id: string;
  name: string;
  type: string;
  floor: number;
  x: number;
  z: number;
  status: "operational" | "warning" | "critical";
  health: number;
}

interface Props {
  project?: { name: string; location?: string; client?: string } | null;
  projectEquipment?: any[];
  ifcMeshes?: any[];
  sensorOverrides?: SensorData[];
}

const EQUIPMENT_POSITIONS = [
  { floor: 3, x: 8,   z: 0  },
  { floor: 0, x: -8,  z: -6 },
  { floor: 0, x: 10,  z: 6  },
  { floor: 1, x: -5,  z: 4  },
  { floor: 2, x: 0,   z: 0  },
  { floor: 1, x: 5,   z: -4 },
  { floor: 2, x: -10, z: 2  },
  { floor: 0, x: 3,   z: -8 },
];

const toEquipmentMarkers = (equip: any[]): EquipmentMarker[] =>
  equip.map((eq, i) => ({
    id: eq.id,
    name: eq.name,
    type: eq.equipment_type || "Equipment",
    floor: EQUIPMENT_POSITIONS[i % EQUIPMENT_POSITIONS.length].floor,
    x: EQUIPMENT_POSITIONS[i % EQUIPMENT_POSITIONS.length].x,
    z: EQUIPMENT_POSITIONS[i % EQUIPMENT_POSITIONS.length].z,
    status: eq.status === "critical" ? "critical" : eq.status === "warning" ? "warning" : "operational",
    health: eq.health_score ?? 80,
  }));

const generateSensorData = (overrides?: SensorData[]): SensorData[] => {
  if (overrides && overrides.length > 0) return overrides;
  const zones = ["A", "B", "C", "D"];
  const data: SensorData[] = [];
  for (let floor = 0; floor < 4; floor++) {
    zones.forEach(zone => {
      data.push({
        floor,
        zone,
        temperature: 18 + Math.random() * 12,
        occupancy: Math.floor(Math.random() * 100),
        humidity: 40 + Math.random() * 30,
        co2: 400 + Math.random() * 600,
        alert: Math.random() > 0.85,
      });
    });
  }
  return data;
};

const generateEquipment = (): EquipmentMarker[] => [
  { id: "E1", name: "Tower Crane #1",  type: "Crane",     floor: 3, x: 8,  z: 0,  status: "operational", health: 92 },
  { id: "E2", name: "Excavator #2",    type: "Excavator", floor: 0, x: -8, z: -6, status: "warning",     health: 65 },
  { id: "E3", name: "Generator #1",    type: "Generator", floor: 0, x: 10, z: 6,  status: "critical",    health: 42 },
  { id: "E4", name: "Concrete Mixer",  type: "Mixer",     floor: 1, x: -5, z: 4,  status: "operational", health: 88 },
  { id: "E5", name: "Elevator",        type: "Elevator",  floor: 2, x: 0,  z: 0,  status: "operational", health: 95 },
];

export default function DigitalTwin3D({ project, projectEquipment, ifcMeshes, sensorOverrides }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const roomMeshesRef = useRef<THREE.Mesh[]>([]);
  const equipmentMeshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({
    isRotating: true,
    isDragging: false,
    angle: Math.PI / 6,
    radius: 60,
    targetY: 30,
    prevX: 0,
    prevY: 0,
  });

  const [colorMode, setColorMode] = useState<"temperature" | "occupancy" | "co2" | "progress" | "safety">("occupancy");
  const [sensorData, setSensorData] = useState<SensorData[]>(() => generateSensorData(sensorOverrides));
  const [equipment, setEquipment] = useState<EquipmentMarker[]>(() =>
    projectEquipment && projectEquipment.length > 0 ? toEquipmentMarkers(projectEquipment) : generateEquipment()
  );
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [alerts, setAlerts] = useState<SensorData[]>([]);
  const [progress] = useState({ foundation: 100, structure: 85, mep: 40, finishing: 15 });
  const usingIFC = !!(ifcMeshes && ifcMeshes.length > 0);

  // Live sensor simulation (skipped if real sensor data provided)
  useEffect(() => {
    if (sensorOverrides && sensorOverrides.length > 0) return;
    const interval = setInterval(() => {
      setSensorData(prev => prev.map(d => ({
        ...d,
        temperature: Math.max(15, Math.min(35, d.temperature + (Math.random() - 0.5) * 0.5)),
        occupancy: Math.max(0, Math.min(100, d.occupancy + (Math.random() - 0.5) * 5)),
        co2: Math.max(400, Math.min(1200, d.co2 + (Math.random() - 0.5) * 20)),
        alert: Math.random() > 0.9,
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, [sensorOverrides]);

  useEffect(() => { setAlerts(sensorData.filter(d => d.alert)); }, [sensorData]);

  useEffect(() => { updateRoomColors(); }, [sensorData, colorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swap equipment when project equipment prop updates
  useEffect(() => {
    if (!sceneRef.current || !projectEquipment || projectEquipment.length === 0) return;
    const newEquip = toEquipmentMarkers(projectEquipment);
    equipmentMeshesRef.current.forEach(m => sceneRef.current!.remove(m));
    equipmentMeshesRef.current = [];
    setEquipment(newEquip);
    addEquipmentMarkersToScene(sceneRef.current, newEquip);
  }, [projectEquipment]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTemperatureColor = (temp: number) => {
    if (temp < 18) return 0x3b82f6;
    if (temp < 22) return 0x10b981;
    if (temp < 26) return 0xf59e0b;
    return 0xef4444;
  };
  const getOccupancyColor = (occ: number) => {
    if (occ < 25) return 0x10b981;
    if (occ < 50) return 0x3b82f6;
    if (occ < 75) return 0xf59e0b;
    return 0xef4444;
  };
  const getCO2Color = (co2: number) => {
    if (co2 < 600) return 0x10b981;
    if (co2 < 800) return 0xf59e0b;
    return 0xef4444;
  };
  const getProgressColor = (floor: number) => {
    const vals = [progress.foundation, progress.structure, progress.mep, progress.finishing];
    const p = vals[floor] || 0;
    if (p >= 90) return 0x10b981;
    if (p >= 50) return 0x3b82f6;
    if (p >= 25) return 0xf59e0b;
    return 0xef4444;
  };

  const getSensorColor = (floorIdx: number, zoneId: string) => {
    // For IFC buildings, average all zones on this floor
    const zone = usingIFC ? undefined : zoneId;
    const floorData = sensorData.filter(d =>
      d.floor === (floorIdx % 4) && (zone ? d.zone === zone : true)
    );
    if (floorData.length === 0) return 0x334155;
    const avg = (key: keyof SensorData) =>
      floorData.reduce((s, d) => s + (d[key] as number), 0) / floorData.length;
    const hasAlert = floorData.some(d => d.alert);

    if (colorMode === "temperature") return getTemperatureColor(avg("temperature"));
    if (colorMode === "occupancy")   return getOccupancyColor(avg("occupancy"));
    if (colorMode === "co2")         return getCO2Color(avg("co2"));
    if (colorMode === "progress")    return getProgressColor(floorIdx % 4);
    if (colorMode === "safety")      return hasAlert ? 0xef4444 : 0x10b981;
    return 0x334155;
  };

  const updateRoomColors = () => {
    roomMeshesRef.current.forEach(mesh => {
      const { floor, zone } = mesh.userData;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      const floorIdx = typeof floor === "number" ? floor : 0;
      mat.color.setHex(getSensorColor(floorIdx, zone || "A"));
      mat.transparent = true;
      mat.opacity = mesh.userData.alert ? 0.9 : (usingIFC ? 0.85 : 0.7);
      mat.needsUpdate = true;
    });
  };

  const addEquipmentMarkersToScene = (scene: THREE.Scene, equip: EquipmentMarker[]) => {
    equip.forEach(eq => {
      const color = eq.status === "operational" ? 0x10b981
        : eq.status === "warning" ? 0xf59e0b : 0xef4444;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 12),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
      );
      marker.position.set(eq.x, eq.floor * 3.5 + 2, eq.z);
      marker.userData = {
        type: "equipment",
        name: eq.name,
        equipmentType: eq.type,
        floor: eq.floor + 1,
        status: eq.status,
        health: `${eq.health}%`,
      };
      scene.add(marker);
      equipmentMeshesRef.current.push(marker);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.05, 8, 24),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
      );
      ring.position.copy(marker.position);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      equipmentMeshesRef.current.push(ring);
    });
  };

  const buildFromIFCMeshes = (scene: THREE.Scene, meshes: any[]) => {
    roomMeshesRef.current = [];

    // Compute bounds for centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    meshes.forEach(m => m.vertices?.forEach((v: number[]) => {
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    }));
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const maxExtent = Math.max(maxX - minX, maxZ - minZ, 1);
    stateRef.current.radius = maxExtent * 1.4;
    stateRef.current.targetY = (maxY - minY) * 0.6;

    // Unique floors sorted by name/elevation
    const uniqueFloors = [...new Set(meshes.map(m => m.floor))].sort();

    meshes.forEach(meshData => {
      try {
        if (!meshData.vertices || !meshData.faces || meshData.vertices.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        const verts: number[] = [];
        meshData.vertices.forEach((v: number[]) => {
          verts.push(v[0] - cx, v[1], v[2] - cz);
        });
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.faces), 1));
        geometry.computeVertexNormals();

        const floorIdx = Math.max(0, uniqueFloors.indexOf(meshData.floor));
        const mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(meshData.color || "#334155"),
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          type: "room",
          floor: floorIdx,
          zone: "A",
          name: meshData.name || meshData.type?.replace("Ifc", "") || "Element",
          elementType: meshData.type,
          ifc: true,
        };
        scene.add(mesh);
        roomMeshesRef.current.push(mesh);
      } catch {}
    });
  };

  const buildProceduralBuilding = (scene: THREE.Scene) => {
    const bW = 16, bD = 12, floorH = 3.5, storeys = 4;
    roomMeshesRef.current = [];

    const zones = [
      { zone: "A", ox: -bW / 4, oz: -bD / 4, w: bW / 2 - 0.2, d: bD / 2 - 0.2 },
      { zone: "B", ox:  bW / 4, oz: -bD / 4, w: bW / 2 - 0.2, d: bD / 2 - 0.2 },
      { zone: "C", ox: -bW / 4, oz:  bD / 4, w: bW / 2 - 0.2, d: bD / 2 - 0.2 },
      { zone: "D", ox:  bW / 4, oz:  bD / 4, w: bW / 2 - 0.2, d: bD / 2 - 0.2 },
    ];

    for (let f = 0; f < storeys; f++) {
      const y = f * floorH;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(bW + 0.5, 0.25, bD + 0.5),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      slab.position.set(0, y, 0);
      slab.receiveShadow = true;
      scene.add(slab);

      zones.forEach(({ zone, ox, oz, w, d }) => {
        const sensor = sensorData.find(s => s.floor === f && s.zone === zone);
        const room = new THREE.Mesh(
          new THREE.BoxGeometry(w, floorH - 0.3, d),
          new THREE.MeshLambertMaterial({ color: 0x334155, transparent: true, opacity: 0.7 })
        );
        room.position.set(ox, y + floorH / 2, oz);
        room.userData = {
          type: "room", floor: f, zone,
          name: `Zone ${zone} - Floor ${f + 1}`,
          temperature: sensor?.temperature?.toFixed(1),
          occupancy: sensor?.occupancy?.toFixed(0),
          co2: sensor?.co2?.toFixed(0),
          alert: sensor?.alert,
        };
        room.castShadow = true;
        scene.add(room);
        roomMeshesRef.current.push(room);
      });

      const wallMat = new THREE.MeshLambertMaterial({ color: 0x0f1e35, transparent: true, opacity: 0.4 });
      [[bW, floorH, 0.2, 0, y + floorH / 2, -bD / 2],
       [bW, floorH, 0.2, 0, y + floorH / 2,  bD / 2],
       [0.2, floorH, bD, -bW / 2, y + floorH / 2, 0],
       [0.2, floorH, bD,  bW / 2, y + floorH / 2, 0],
      ].forEach(([w, h, d, x, wy, z]) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, wy, z);
        scene.add(wall);
      });

      const glassMat = new THREE.MeshLambertMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25 });
      [-4, -1.5, 1.5, 4].forEach(wx => {
        [-bD / 2, bD / 2].forEach(wz => {
          const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.3), glassMat);
          win.position.set(wx, y + floorH / 2, wz);
          scene.add(win);
        });
      });

      const colMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });
      [[-bW/2,-bD/2],[bW/2,-bD/2],[-bW/2,bD/2],[bW/2,bD/2],[0,-bD/2],[0,bD/2],[-bW/2,0],[bW/2,0]]
        .forEach(([cx2, cz2]) => {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, floorH, 0.5), colMat);
          col.position.set(cx2, y + floorH / 2, cz2);
          scene.add(col);
        });
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 1, 0.4, bD + 1),
      new THREE.MeshLambertMaterial({ color: 0x0f1e35 })
    );
    roof.position.set(0, storeys * floorH + 0.2, 0);
    scene.add(roof);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x050d1a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 700;
    const height = 580;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060d1a);
    scene.fog = new THREE.Fog(0x060d1a, 100, 250);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(45, 35, 45);
    camera.lookAt(0, 8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x0a1628, 0.8));
    const dirLight = new THREE.DirectionalLight(0x4488ff, 0.6);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);
    scene.add(new THREE.PointLight(0x3b82f6, 0.8, 80));
    scene.add(new THREE.GridHelper(120, 60, 0x1e3a5f, 0x0f2040));

    if (usingIFC) {
      buildFromIFCMeshes(scene, ifcMeshes!);
    } else {
      buildProceduralBuilding(scene);
    }
    addEquipmentMarkersToScene(scene, equipment);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const canvas = renderer.domElement;

    const onCanvasClick = (e: MouseEvent) => {
      if (stateRef.current.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const allMeshes = [...roomMeshesRef.current, ...equipmentMeshesRef.current];
      const intersects = raycaster.intersectObjects(allMeshes);
      setSelectedItem(intersects.length > 0 ? intersects[0].object.userData : null);
    };
    const onMouseDown = (e: MouseEvent) => {
      stateRef.current.isDragging = false;
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - stateRef.current.prevX);
      const dy = Math.abs(e.clientY - stateRef.current.prevY);
      if (dx > 3 || dy > 3) stateRef.current.isDragging = true;
      if (!stateRef.current.isDragging) return;
      stateRef.current.angle -= (e.clientX - stateRef.current.prevX) * 0.007;
      stateRef.current.targetY = Math.max(5, Math.min(70,
        stateRef.current.targetY - (e.clientY - stateRef.current.prevY) * 0.12
      ));
      stateRef.current.prevX = e.clientX;
      stateRef.current.prevY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.radius = Math.max(15, Math.min(200,
        stateRef.current.radius + e.deltaY * 0.05
      ));
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", () => {});
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onCanvasClick);

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
      equipmentMeshesRef.current.forEach((mesh, i) => {
        if ((mesh.geometry as any).type === "SphereGeometry") {
          const sc = 1 + Math.sin(t * 2 + i) * 0.15;
          mesh.scale.set(sc, sc, sc);
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
      canvas.removeEventListener("click", onCanvasClick);
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const colorModes = [
    { id: "occupancy",   label: "Occupancy",   icon: "👥" },
    { id: "temperature", label: "Temperature", icon: "🌡️" },
    { id: "co2",         label: "CO₂",         icon: "💨" },
    { id: "progress",    label: "Progress",    icon: "🏗️" },
    { id: "safety",      label: "Safety",      icon: "⚠️" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 bg-secondary rounded-xl p-1 flex-wrap">
          {colorModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => setColorMode(mode.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                colorMode === mode.id ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          {usingIFC && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              IFC Model Loaded
            </span>
          )}
          {alerts.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
              ⚠️ {alerts.length} Active Alerts
            </span>
          )}
          <button
            onClick={() => { stateRef.current.isRotating = !stateRef.current.isRotating; setIsRotating(stateRef.current.isRotating); }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
              isRotating ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {isRotating ? "⏸ Pause" : "▶ Rotate"}
          </button>
        </div>
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-blue-500/20" style={{ height: "580px" }}>
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-blue-500/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">
              {project?.name ?? "Live Digital Twin"}
            </span>
          </div>
          {project?.location && (
            <div className="bg-black/60 backdrop-blur rounded-xl px-3 py-1.5 border border-border">
              <p className="text-xs text-muted-foreground">📍 {project.location}</p>
            </div>
          )}
          {project?.client && (
            <div className="bg-black/60 backdrop-blur rounded-xl px-3 py-1.5 border border-border">
              <p className="text-xs text-muted-foreground">🏢 {project.client}</p>
            </div>
          )}
          <div className="bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-border">
            <p className="text-xs text-muted-foreground">🖱️ Drag · Scroll · Click element</p>
          </div>
        </div>

        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 border border-border">
          <p className="text-xs font-medium text-foreground mb-2 capitalize">
            {colorMode === "occupancy" ? "👥 Occupancy" : colorMode === "temperature" ? "🌡️ Temperature" :
             colorMode === "co2" ? "💨 CO₂ Level" : colorMode === "progress" ? "🏗️ Progress" : "⚠️ Safety"}
          </p>
          {[
            { color: "#10b981", label: colorMode === "temperature" ? "< 18°C" : colorMode === "co2" ? "< 600ppm" : "Low / Good" },
            { color: "#3b82f6", label: colorMode === "temperature" ? "18-22°C" : colorMode === "co2" ? "600-800ppm" : "Moderate" },
            { color: "#f59e0b", label: colorMode === "temperature" ? "22-26°C" : colorMode === "co2" ? "800-1000ppm" : "High" },
            { color: "#ef4444", label: colorMode === "temperature" ? "> 26°C" : colorMode === "co2" ? "> 1000ppm" : "Critical" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border space-y-1">
            {[["#10b981","Equipment OK"],["#f59e0b","Warning"],["#ef4444","Critical"]].map(([c,l]) => (
              <div key={l} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-xs text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedItem && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl p-4 border border-blue-500/30 min-w-52">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-blue-400">
                {selectedItem.type === "equipment" ? "🔧 Equipment" : "🏢 Element Info"}
              </p>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground text-sm">×</button>
            </div>
            {Object.entries(selectedItem).filter(([k]) => !["type","ifc","elementType"].includes(k)).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-4 mb-1">
                <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                <span className={`text-xs font-medium ${
                  key === "alert" && val ? "text-red-400" :
                  key === "status" && val === "critical" ? "text-red-400" :
                  key === "status" && val === "warning" ? "text-orange-400" : "text-foreground"
                }`}>
                  {key === "alert" ? (val ? "⚠️ Alert!" : "✅ Normal") : String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {alerts.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur rounded-xl p-3 border border-red-500/30 max-w-48">
            <p className="text-xs font-medium text-red-400 mb-2">⚠️ Active Alerts</p>
            {alerts.slice(0, 3).map((alert, i) => (
              <div key={i} className="text-xs text-muted-foreground mb-1">
                Floor {alert.floor + 1} Zone {alert.zone}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Avg Temperature", value: `${(sensorData.reduce((s,d)=>s+d.temperature,0)/sensorData.length).toFixed(1)}°C`, color: "text-orange-400", bg: "bg-orange-500/5 border-orange-500/20" },
          { label: "Avg Occupancy",   value: `${(sensorData.reduce((s,d)=>s+d.occupancy,0)/sensorData.length).toFixed(0)}%`,    color: "text-blue-400",   bg: "bg-blue-500/5 border-blue-500/20" },
          { label: "Active Alerts",   value: alerts.length.toString(), color: alerts.length > 0 ? "text-red-400" : "text-emerald-400", bg: alerts.length > 0 ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20" },
          { label: "Equipment Status", value: `${equipment.filter(e=>e.status==="operational").length}/${equipment.length} OK`, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
        ].map((stat, i) => (
          <motion.div key={i} className={`rounded-xl border p-3 ${stat.bg}`}>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-lg font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            <div className="flex items-center gap-1 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Live</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
