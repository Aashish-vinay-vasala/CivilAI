"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import axios from "axios";
import {
  Activity,
  Building2,
  Thermometer,
  Users,
  AlertTriangle,
  Cpu,
  Wifi,
  ChevronDown,
  Upload,
  FileText,
  X,
  CheckCircle2,
} from "lucide-react";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const SITE_TABS = [
  { href: "/bim", label: "BIM & CAD" },
  { href: "/digital-twin", label: "Digital Twin" },
  { href: "/weather", label: "Weather" },
  { href: "/green", label: "Green Monitor" },
];

const DigitalTwin3D = dynamic(
  () => import("@/components/bim/DigitalTwin3D"),
  { ssr: false }
);

// Parse CSV sensor data: floor,zone,temperature,occupancy,co2[,humidity]
function parseCSV(text: string) {
  const lines = text.trim().split("\n").slice(1); // skip header
  return lines.flatMap(line => {
    const [floor, zone, temperature, occupancy, co2, humidity] = line.split(",").map(s => s.trim());
    if (!floor || !zone) return [];
    return [{
      floor: parseInt(floor, 10) || 0,
      zone: zone.toUpperCase(),
      temperature: parseFloat(temperature) || 22,
      occupancy: parseFloat(occupancy) || 50,
      humidity: parseFloat(humidity) || 55,
      co2: parseFloat(co2) || 600,
      alert: false,
    }];
  });
}

export default function DigitalTwinPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projectEquipment, setProjectEquipment] = useState<any[]>([]);
  const [, setLoadingProject] = useState(false);
  const [twinReady, setTwinReady] = useState(false);

  // IFC state
  const [ifcMeshes, setIfcMeshes] = useState<any[]>([]);
  const [ifcFileName, setIfcFileName] = useState("");
  const [loadingIFC, setLoadingIFC] = useState(false);
  const [ifcError, setIfcError] = useState("");
  const ifcInputRef = useRef<HTMLInputElement>(null);

  // CSV sensor state
  const [sensorOverrides, setSensorOverrides] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (projectId) fetchProjectData(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load saved IFC for the project
  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(`dt_ifc_${projectId}`);
    if (saved) {
      try {
        const { meshes, filename } = JSON.parse(saved);
        if (meshes?.length > 0) {
          setIfcMeshes(meshes);
          setIfcFileName(filename);
        }
      } catch {}
    } else {
      // Clear IFC when switching to a project with no saved model
      setIfcMeshes([]);
      setIfcFileName("");
    }
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) {
        setProjectId(p[0].id);
        setSelectedProject(p[0]);
      } else {
        setTwinReady(true);
      }
    } catch {
      setTwinReady(true);
    }
  };

  const fetchProjectData = async () => {
    setLoadingProject(true);
    setTwinReady(false);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL;
      const [projRes, equipRes] = await Promise.all([
        axios.get(`${api}/api/v1/projects/${projectId}`).catch(() => ({ data: { project: null } })),
        axios.get(`${api}/api/v1/projects/${projectId}/equipment`).catch(() => ({ data: { equipment: [] } })),
      ]);
      if (projRes.data.project) setSelectedProject(projRes.data.project);
      setProjectEquipment(equipRes.data.equipment || []);
    } catch {}
    setLoadingProject(false);
    setTwinReady(true);
  };

  const handleIFCUpload = async (file: File) => {
    setLoadingIFC(true);
    setIfcFileName(file.name);
    setIfcError("");
    setIfcMeshes([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/parse-3d`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.meshes && data.meshes.length > 0) {
        setIfcMeshes(data.meshes);
        setIfcError("");
        if (projectId) {
          localStorage.setItem(`dt_ifc_${projectId}`, JSON.stringify({
            meshes: data.meshes,
            filename: file.name,
          }));
        }
      } else {
        setIfcError(data.error || data.detail || "No geometry found in this IFC file.");
      }
    } catch {
      setIfcError("Could not reach backend. Make sure the server is running.");
    }
    setLoadingIFC(false);
  };

  const handleCSVUpload = (file: File) => {
    setCsvFileName(file.name);
    setCsvError("");
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = parseCSV(e.target?.result as string);
        if (parsed.length === 0) {
          setCsvError("No valid rows found. Format: floor,zone,temperature,occupancy,co2");
        } else {
          setSensorOverrides(parsed);
        }
      } catch {
        setCsvError("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
  };

  const equipmentCount = projectEquipment.length || 5;

  // Compose the twin key so it remounts when project or files change
  const twinKey = `${projectId}-${ifcMeshes.length}-${sensorOverrides.length}`;

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={SITE_TABS} />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Digital Twin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedProject
              ? `Live 3D simulation — ${selectedProject.name}`
              : "Live 3D building simulation with real-time sensor data"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {projects.length > 0 && (
            <div className="relative">
              <select
                value={projectId}
                onChange={e => {
                  const p = projects.find(x => x.id === e.target.value);
                  setProjectId(e.target.value);
                  if (p) setSelectedProject(p);
                }}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl text-xs border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Live Simulation</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium">IoT Connected</span>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Sensor Zones",      value: "16",                   icon: Cpu,       color: "border-blue-500/20 bg-blue-500/5",      iconColor: "text-blue-400"    },
          { label: "Equipment Tracked", value: String(equipmentCount), icon: Building2, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Update Interval",   value: "3s",                   icon: Activity,  color: "border-cyan-500/20 bg-cyan-500/5",  iconColor: "text-cyan-400"  },
          { label: "Data Points",       value: "64/min",               icon: Wifi,      color: "border-orange-500/20 bg-orange-500/5",  iconColor: "text-orange-400"  },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* File Upload Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card border border-border rounded-2xl p-5"
      >
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-400" />
          Import Data
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* IFC Upload */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">BIM / IFC Model</p>
            <p className="text-xs text-muted-foreground/70">Upload an .ifc file to replace the default scene. Uploading a new file replaces it; the × button clears it.</p>
            <input
              ref={ifcInputRef}
              type="file"
              accept=".ifc"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleIFCUpload(f); e.target.value = ""; }}
            />
            {ifcMeshes.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs text-cyan-400 truncate flex-1">{ifcFileName}</span>
                <button onClick={() => {
                  setIfcMeshes([]);
                  setIfcFileName("");
                  if (projectId) localStorage.removeItem(`dt_ifc_${projectId}`);
                }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => ifcInputRef.current?.click()}
                disabled={loadingIFC}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-sm text-muted-foreground disabled:opacity-50"
              >
                {loadingIFC ? (
                  <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Parsing IFC...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Choose .ifc file</>
                )}
              </button>
            )}
            {ifcError && (
              <p className="text-xs text-red-400 px-1">{ifcError}</p>
            )}
          </div>

          {/* CSV Sensor Upload */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sensor Data (CSV)</p>
            <p className="text-xs text-muted-foreground/70">
              Upload a CSV to override simulated sensor readings.
              Format: <code className="bg-secondary px-1 rounded text-[11px]">floor,zone,temperature,occupancy,co2</code>
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVUpload(f); e.target.value = ""; }}
            />
            {sensorOverrides.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-400 flex-1 truncate">{csvFileName} ({sensorOverrides.length} readings)</span>
                <button onClick={() => { setSensorOverrides([]); setCsvFileName(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => csvInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors text-sm text-muted-foreground"
              >
                <FileText className="w-4 h-4" /> Choose .csv file
              </button>
            )}
            {csvError && (
              <p className="text-xs text-red-400 px-1">{csvError}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Digital Twin Viewer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Building2 className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-foreground">
            {selectedProject ? selectedProject.name : "Live 3D Building Model"}
          </h3>
          {selectedProject?.location && (
            <span className="text-xs text-muted-foreground">— {selectedProject.location}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {ifcMeshes.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                IFC: {ifcFileName}
              </span>
            )}
            {sensorOverrides.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Sensors
              </span>
            )}
            {!ifcMeshes.length && !sensorOverrides.length && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                Demo Mode
              </span>
            )}
          </div>
        </div>

        {twinReady ? (
          <DigitalTwin3D
            key={twinKey}
            project={selectedProject}
            projectEquipment={projectEquipment}
            ifcMeshes={ifcMeshes.length > 0 ? ifcMeshes : undefined}
            sensorOverrides={sensorOverrides.length > 0 ? sensorOverrides : undefined}
          />
        ) : (
          <div className="h-145 flex items-center justify-center rounded-2xl bg-secondary/20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Connecting to project...</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Capabilities */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Digital Twin Capabilities</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { icon: Thermometer, title: "Environmental Monitoring", desc: "Real-time temperature, humidity, CO₂ and air quality tracking per zone", color: "text-orange-400 bg-orange-500/10" },
            { icon: Users,       title: "Occupancy Analytics",      desc: "Live occupancy tracking per floor and zone with capacity alerts",         color: "text-blue-400 bg-blue-500/10"   },
            { icon: Cpu,         title: "Equipment Tracking",        desc: "Real-time equipment location, health scores and maintenance alerts",      color: "text-emerald-400 bg-emerald-500/10" },
            { icon: AlertTriangle, title: "Smart Alerts",           desc: "AI-powered anomaly detection with instant visual alerts on 3D model",     color: "text-red-400 bg-red-500/10"     },
            { icon: Activity,    title: "Progress Tracking",         desc: "Construction progress visualization per zone and floor in real-time",     color: "text-cyan-400 bg-cyan-500/10" },
            { icon: Building2,   title: "BIM Integration",           desc: "Upload your IFC file to replace the demo building with real geometry",    color: "text-cyan-400 bg-cyan-500/10"   },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-start gap-3 p-4 rounded-xl bg-secondary/40"
            >
              <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                <item.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <ModuleChat
        context="Digital Twin"
        placeholder="Ask about sensors, occupancy, equipment..."
        pageSummaryData={{
          project: selectedProject?.name ?? "Demo Building",
          location: selectedProject?.location ?? null,
          sensorZones: 16,
          equipmentTracked: equipmentCount,
          ifcLoaded: ifcMeshes.length > 0,
          realSensors: sensorOverrides.length > 0,
          updateInterval: "3s",
        }}
      />
    </div>
  );
}
