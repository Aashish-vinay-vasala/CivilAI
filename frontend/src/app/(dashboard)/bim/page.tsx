"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Building2, Upload, Loader2, CheckCircle, AlertTriangle, Layers, Box,
  FileText, Eye, Sparkles, Wrench, ClipboardList, GitMerge, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import dynamic from "next/dynamic";
import { MarkdownText } from "@/lib/renderMarkdown";

const BIMViewer3D = dynamic(() => import("@/components/bim/BIMViewer3D"), { ssr: false });
const SiteProgress3D = dynamic(() => import("@/components/bim/SiteProgress3D"), { ssr: false });
const SafetyHeatmap3D = dynamic(() => import("@/components/bim/SafetyHeatmap3D"), { ssr: false });
const EquipmentMap3D = dynamic(() => import("@/components/bim/EquipmentMap3D"), { ssr: false });
const SpacePlanning3D = dynamic(() => import("@/components/bim/SpacePlanning3D"), { ssr: false });

const SITE_TABS = [
  { href: "/bim", label: "BIM & CAD" },
  { href: "/digital-twin", label: "Digital Twin" },
  { href: "/weather", label: "Weather" },
  { href: "/green", label: "Green Monitor" },
];

const sampleElements = [
  { name: "Walls", count: 124, color: "#3b82f6" },
  { name: "Floors", count: 18, color: "#10b981" },
  { name: "Doors", count: 48, color: "#f59e0b" },
  { name: "Windows", count: 86, color: "#8b5cf6" },
  { name: "Columns", count: 32, color: "#ef4444" },
  { name: "Beams", count: 28, color: "#06b6d4" },
];

const sampleStoreys = [
  { name: "Ground Floor", elevation: 0 },
  { name: "First Floor", elevation: 3.5 },
  { name: "Second Floor", elevation: 7.0 },
  { name: "Third Floor", elevation: 10.5 },
  { name: "Roof", elevation: 14.0 },
];

const ELEMENT_COLORS: Record<string, string> = {
  walls: "#3b82f6", floors: "#10b981", doors: "#f59e0b",
  windows: "#8b5cf6", columns: "#ef4444", beams: "#06b6d4",
  roofs: "#94a3b8", stairs: "#f97316", spaces: "#a78bfa",
};

const tabs = [
  { id: "overview",  label: "Overview",   icon: Building2 },
  { id: "viewer",    label: "3D Viewer",  icon: Eye },
  { id: "elements",  label: "Elements",   icon: Layers },
  { id: "boq",       label: "BOQ",        icon: ClipboardList },
  { id: "clashes",   label: "Clashes",    icon: AlertTriangle },
  { id: "diff",      label: "Model Diff", icon: GitMerge },
  { id: "drawing",   label: "Drawing AI", icon: Sparkles },
  { id: "progress",  label: "Progress",   icon: CheckCircle },
  { id: "safety",    label: "Safety Map", icon: AlertTriangle },
  { id: "equipment", label: "Equipment",  icon: Wrench },
  { id: "space",     label: "Space Plan", icon: Box },
];

export default function BIMPage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [bimData, setBimData] = useState<any>(null);
  const [meshData, setMeshData] = useState<any[]>([]);
  const [clashData, setClashData] = useState<any>(null);
  const [analysis, setAnalysis] = useState("");
  const [drawingAnalysis, setDrawingAnalysis] = useState("");
  const [boqData, setBoqData] = useState<any>(null);
  const [boqAnalysis, setBoqAnalysis] = useState("");
  const [diffData, setDiffData] = useState<any>(null);
  const [clashFile2Name, setClashFile2Name] = useState("");

  // File input refs — all hidden inputs triggered programmatically to avoid
  // the <button>-inside-<label> click-propagation bug
  const ifcInputRef = useRef<HTMLInputElement>(null);
  const boqInputRef = useRef<HTMLInputElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const clashInputRef = useRef<HTMLInputElement>(null);
  const clashFile2Ref = useRef<HTMLInputElement>(null);
  const diffFile1Ref = useRef<HTMLInputElement>(null);
  const diffFile2Ref = useRef<HTMLInputElement>(null);
  const [diffFile1, setDiffFile1] = useState<File | null>(null);
  const [diffFile2, setDiffFile2] = useState<File | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // ── IFC upload (header — populates elements + 3D viewer) ──────────────────
  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd1 = new FormData(); fd1.append("file", file);
      const fd2 = new FormData(); fd2.append("file", file);

      const [metaRes, meshRes] = await Promise.allSettled([
        axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/analyze-ifc-ai`, fd1),
        axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/parse-3d`, fd2),
      ]);

      if (metaRes.status === "fulfilled") {
        setBimData(metaRes.value.data.bim_data);
        setAnalysis(metaRes.value.data.ai_analysis);
      }
      if (meshRes.status === "fulfilled" && meshRes.value.data.success && meshRes.value.data.meshes?.length > 0) {
        setMeshData(meshRes.value.data.meshes);
      }

      toast.success("IFC file parsed & analyzed!");
      setActiveTab("elements");
    } catch {
      toast.error("Failed to parse IFC file");
    } finally {
      setLoading(false);
    }
  };

  // ── Clash detection (supports optional second model) ──────────────────────
  const handleClashDetection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const file2 = clashFile2Ref.current?.files?.[0];
      if (file2) formData.append("file2", file2);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/clash-detection`, formData);
      setClashData(response.data.data);
      toast.success(`Clash detection complete!${file2 ? " (Cross-model)" : ""}`);
      setActiveTab("clashes");
    } catch {
      toast.error("Failed to run clash detection");
    } finally {
      setLoading(false);
    }
  };

  // ── Drawing AI (image or PDF) ──────────────────────────────────────────────
  const handleDrawingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/analyze-drawing`, formData);
      setDrawingAnalysis(response.data.analysis);
      toast.success("Drawing analyzed!");
      setActiveTab("drawing");
    } catch {
      toast.error("Failed to analyze drawing");
    } finally {
      setLoading(false);
    }
  };

  // ── BOQ ───────────────────────────────────────────────────────────────────
  const handleBOQUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/quantities-report`, fd);
      setBoqData(res.data.boq);
      setBoqAnalysis(res.data.ai_analysis);
      toast.success("BOQ generated!");
      setActiveTab("boq");
    } catch {
      toast.error("Failed to generate BOQ");
    } finally {
      setLoading(false);
    }
  };

  // ── Model Diff ────────────────────────────────────────────────────────────
  const handleRunDiff = async () => {
    if (!diffFile1 || !diffFile2) { toast.error("Select both IFC models"); return; }
    setDiffLoading(true);
    try {
      const fd = new FormData();
      fd.append("file1", diffFile1);
      fd.append("file2", diffFile2);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/diff-ifc`, fd);
      setDiffData(res.data);
      toast.success("Model comparison complete!");
    } catch {
      toast.error("Failed to compare models");
    } finally {
      setDiffLoading(false);
    }
  };

  // ── CSV exports ───────────────────────────────────────────────────────────
  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportElementsCSV = () => {
    if (!bimData?.summary) return;
    const rows = [["Element Type", "Count"]];
    Object.entries(bimData.summary).forEach(([name, count]: any) => {
      if (count > 0) rows.push([name, count]);
    });
    downloadCSV(rows, `${bimData.filename || "bim"}_elements.csv`);
  };

  const handleExportBOQCSV = () => {
    if (!boqData?.items) return;
    const rows = [["Category", "Item", "Description", "Quantity", "Unit", "Area m²", "Length m"]];
    boqData.items.forEach((item: any) => {
      rows.push([
        item.category || "", item.item || "", item.description || "",
        item.quantity || 0, item.unit || "",
        item.area_m2 ?? item.total_area_m2 ?? "",
        item.length_m ?? "",
      ]);
    });
    downloadCSV(rows, `${boqData.filename || "boq"}_quantities.csv`);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const elementData = bimData?.summary
    ? Object.entries(bimData.summary)
        .filter(([, count]: any) => count > 0)
        .map(([name, count]: any) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          count,
          color: ELEMENT_COLORS[name] || "#3b82f6",
        }))
    : sampleElements;

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={SITE_TABS} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">BIM & CAD Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            IFC parsing · Clash detection · 3D viewer · BOQ · Model diff · Drawing AI
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Hidden inputs — triggered via refs to avoid button-inside-label click loss */}
          <input ref={ifcInputRef} type="file" className="hidden" accept=".ifc" onChange={handleIFCUpload} />
          <input ref={boqInputRef} type="file" className="hidden" accept=".ifc" onChange={handleBOQUpload} />
          <input ref={drawingInputRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleDrawingUpload} />
          <input ref={clashInputRef} type="file" className="hidden" accept=".ifc" onChange={handleClashDetection} />

          <Button variant="outline" disabled={loading} onClick={() => ifcInputRef.current?.click()}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Box className="w-4 h-4 mr-2 text-blue-400" />}
            Upload IFC
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => boqInputRef.current?.click()}>
            <ClipboardList className="w-4 h-4 mr-2 text-emerald-400" />Generate BOQ
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => drawingInputRef.current?.click()}>
            <FileText className="w-4 h-4 mr-2 text-cyan-400" />Analyze Drawing
          </Button>
          <Button className="gradient-blue text-white border-0" disabled={loading} onClick={() => clashInputRef.current?.click()}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            Clash Detection
          </Button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Elements", value: bimData?.total_elements?.toString() || "336", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Storeys", value: bimData?.storeys?.length?.toString() || "5", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Clashes Found", value: clashData?.total_clashes?.toString() || "0", color: "border-red-500/20 bg-red-500/5" },
          { label: "Warnings", value: clashData?.total_warnings?.toString() || "0", color: "border-orange-500/20 bg-orange-500/5" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}>
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
            {bimData && <p className="text-xs text-emerald-400 mt-1">Live IFC Data</p>}
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              activeTab === tab.id ? "bg-blue-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Upload BIM/CAD Files</h3>
              <div className="space-y-3">
                {[
                  { label: "IFC File", desc: "Parse BIM model, extract elements + 3D", accept: ".ifc", icon: Box, onChange: handleIFCUpload },
                  { label: "BOQ from IFC", desc: "Generate Bill of Quantities", accept: ".ifc", icon: ClipboardList, onChange: handleBOQUpload },
                  { label: "CAD Drawing / PDF", desc: "AI analysis of blueprints (image or PDF)", accept: ".png,.jpg,.jpeg,.pdf", icon: FileText, onChange: handleDrawingUpload },
                  { label: "Clash Detection", desc: "Find geometry conflicts", accept: ".ifc", icon: AlertTriangle, onChange: handleClashDetection },
                ].map((item, i) => (
                  <label key={i} className="cursor-pointer block">
                    <input type="file" className="hidden" accept={item.accept} onChange={item.onChange} />
                    <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                        <item.icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </label>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-4">
                Element Distribution
                {bimData && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live IFC</span>}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={elementData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="count">
                    {elementData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {elementData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-muted-foreground">{item.name}: {item.count}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }} className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-4">Building Storeys</h3>
            <div className="space-y-2">
              {(bimData?.storeys || sampleStoreys).map((storey: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-4 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{storey.name}</p>
                    <p className="text-xs text-muted-foreground">Elevation: {storey.elevation}m</p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 3D Viewer ────────────────────────────────────────────────────── */}
      {activeTab === "viewer" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">3D BIM Viewer</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Three.js</span>
            {bimData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{bimData.storeys?.length || 4} Storeys</span>}
          </div>
          <BIMViewer3D bimData={bimData} initialMeshes={meshData} />
        </motion.div>
      )}

      {/* ── Elements ─────────────────────────────────────────────────────── */}
      {activeTab === "elements" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">BIM Elements</h3>
              {bimData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">From {bimData.filename}</span>}
            </div>
            {bimData && (
              <Button size="sm" variant="outline" onClick={handleExportElementsCSV}>
                <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
              </Button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={elementData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                {elementData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {bimData?.materials?.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground mb-2">Materials Found:</p>
              <div className="flex flex-wrap gap-2">
                {bimData.materials.map((mat: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">{mat}</span>
                ))}
              </div>
            </div>
          )}
          {!bimData && (
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => ifcInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />Upload IFC to see live data
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* ── BOQ ──────────────────────────────────────────────────────────── */}
      {activeTab === "boq" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-foreground">Bill of Quantities</h3>
              {boqData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{boqData.project_name}</span>}
            </div>
            {boqData && (
              <Button size="sm" variant="outline" onClick={handleExportBOQCSV}>
                <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
              </Button>
            )}
          </div>

          {!boqData ? (
            <div className="text-center py-8">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-4">Upload an IFC file to generate a Bill of Quantities</p>
              <Button className="gradient-blue text-white border-0" disabled={loading}
                onClick={() => boqInputRef.current?.click()}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Generate BOQ
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total Elements", value: boqData.total_elements },
                  { label: "Storeys", value: boqData.storeys },
                  { label: "Line Items", value: boqData.items?.length },
                ].map((s, i) => (
                  <div key={i} className="bg-secondary/40 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/50">
                      {["Category", "Item", "Description", "Qty", "Unit", "Measure"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boqData.items?.map((item: any, i: number) => (
                      <tr key={i} className={`border-t border-border ${i % 2 === 0 ? "bg-secondary/20" : ""}`}>
                        <td className="px-3 py-2 text-blue-400 font-medium">{item.category}</td>
                        <td className="px-3 py-2 text-foreground font-medium">{item.item}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.description}</td>
                        <td className="px-3 py-2 text-foreground font-bold">{item.quantity}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.area_m2 != null ? `${item.area_m2} m²` :
                           item.total_area_m2 != null ? `${item.total_area_m2} m²` :
                           item.length_m != null ? `${item.length_m} m` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {boqData.materials?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Materials in Model:</p>
                  <div className="flex flex-wrap gap-2">
                    {boqData.materials.map((m: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {boqAnalysis && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm font-medium text-foreground">AI Quantity Surveyor Analysis</p>
                  </div>
                  <MarkdownText text={boqAnalysis} className="text-xs text-muted-foreground leading-relaxed" />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Clashes ──────────────────────────────────────────────────────── */}
      {activeTab === "clashes" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Clash Detection</h3>

          {/* Two-model upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 p-4 rounded-xl bg-secondary/30 border border-border">
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Model A — Structural (required)</p>
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-secondary/50 transition-all cursor-pointer"
                onClick={() => clashInputRef.current?.click()}>
                <Box className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Upload Model A (.ifc)</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Model B — MEP/Services (optional)</p>
              <label className="cursor-pointer block">
                <input ref={clashFile2Ref} type="file" className="hidden" accept=".ifc"
                  onChange={e => setClashFile2Name(e.target.files?.[0]?.name || "")} />
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-secondary/50 transition-all cursor-pointer"
                  onClick={() => clashFile2Ref.current?.click()}>
                  <GitMerge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-muted-foreground">{clashFile2Name || "Upload Model B (.ifc)"}</span>
                </div>
              </label>
            </div>
          </div>

          {!clashData ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Upload Model A (structural IFC) to run clash detection</p>
            </div>
          ) : (
            <div className="space-y-4">
              {clashData.cross_model && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <GitMerge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-medium">Cross-model (Structural vs MEP) analysis active</span>
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Clashes", value: clashData.total_clashes, color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
                  { label: "Warnings", value: clashData.total_warnings, color: "text-orange-400", bg: "bg-orange-500/5 border-orange-500/20" },
                  { label: "Walls Checked", value: clashData.summary?.walls_checked || 0, color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
                  { label: "Beams Checked", value: clashData.summary?.beams_checked || 0, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
                ].map((s, i) => (
                  <div key={i} className={`rounded-xl border p-4 text-center ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {clashData.clashes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Geometry Clashes:</p>
                  {clashData.clashes.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium">{c.type}</p>
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                        {c.element_a && c.element_b && <p className="text-xs text-red-300 mt-0.5">{c.element_a} ↔ {c.element_b}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ml-auto whitespace-nowrap ${
                        c.severity === "Critical" ? "bg-red-500/20 text-red-300" :
                        c.severity === "High" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-300"
                      }`}>{c.severity}</span>
                    </div>
                  ))}
                </div>
              )}
              {clashData.clashes?.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm text-emerald-400">No geometry clashes detected</p>
                </div>
              )}
              {clashData.warnings?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Quality Warnings:</p>
                  {clashData.warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                      <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{w.type}</p>
                        <p className="text-xs text-muted-foreground">{w.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ml-auto whitespace-nowrap">{w.severity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Model Diff ───────────────────────────────────────────────────── */}
      {activeTab === "diff" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <GitMerge className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">IFC Model Diff</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Compare two versions</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { label: "Model A (original)", file: diffFile1, setFile: setDiffFile1, ref: diffFile1Ref, color: "blue" },
              { label: "Model B (updated)", file: diffFile2, setFile: setDiffFile2, ref: diffFile2Ref, color: "cyan" },
            ].map(({ label, file, setFile, ref, color }) => (
              <div key={label}>
                <p className="text-xs font-medium text-foreground mb-2">{label}</p>
                <label className="cursor-pointer block">
                  <input ref={ref} type="file" className="hidden" accept=".ifc"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                  <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                    file ? `bg-${color}-500/5 border-${color}-500/30` : "border-border hover:bg-secondary/50"
                  }`} onClick={() => ref.current?.click()}>
                    <Box className={`w-5 h-5 ${file ? `text-${color}-400` : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm text-foreground">{file ? file.name : "Click to upload .ifc"}</p>
                      {file && <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>}
                    </div>
                    {file && <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />}
                  </div>
                </label>
              </div>
            ))}
          </div>

          <Button onClick={handleRunDiff} disabled={!diffFile1 || !diffFile2 || diffLoading}
            className="gradient-blue text-white border-0 w-full">
            {diffLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitMerge className="w-4 h-4 mr-2" />}
            Compare Models
          </Button>

          {diffData && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Added", value: diffData.summary?.added_count, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
                  { label: "Removed", value: diffData.summary?.removed_count, color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
                  { label: "Modified", value: diffData.summary?.modified_count, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/20" },
                  { label: "Unchanged", value: diffData.summary?.unchanged_count, color: "text-muted-foreground", bg: "bg-secondary/40 border-border" },
                ].map((s, i) => (
                  <div key={i} className={`rounded-xl border p-4 text-center ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {diffData.added?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-emerald-400">Added ({diffData.added.length})</p>
                  {diffData.added.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <span className="text-xs font-mono text-emerald-400">+</span>
                      <span className="text-xs text-foreground">{el.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{el.type?.replace("Ifc", "")}</span>
                    </div>
                  ))}
                  {diffData.added.length > 10 && <p className="text-xs text-muted-foreground pl-2">+{diffData.added.length - 10} more</p>}
                </div>
              )}

              {diffData.removed?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-red-400">Removed ({diffData.removed.length})</p>
                  {diffData.removed.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                      <span className="text-xs font-mono text-red-400">−</span>
                      <span className="text-xs text-foreground">{el.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{el.type?.replace("Ifc", "")}</span>
                    </div>
                  ))}
                  {diffData.removed.length > 10 && <p className="text-xs text-muted-foreground pl-2">+{diffData.removed.length - 10} more</p>}
                </div>
              )}

              {diffData.modified?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-amber-400">Modified ({diffData.modified.length})</p>
                  {diffData.modified.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <span className="text-xs font-mono text-amber-400">~</span>
                      <span className="text-xs text-foreground">{el.name}</span>
                      <span className="text-xs text-amber-400/70 ml-auto">{el.changes?.join(", ")}</span>
                    </div>
                  ))}
                  {diffData.modified.length > 10 && <p className="text-xs text-muted-foreground pl-2">+{diffData.modified.length - 10} more</p>}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Drawing AI ───────────────────────────────────────────────────── */}
      {activeTab === "drawing" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-foreground">Drawing AI Analysis</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Image · PDF</span>
          </div>
          {!drawingAnalysis ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Upload a blueprint, CAD drawing, or PDF to analyze</p>
              <p className="text-xs text-muted-foreground mb-4">Supports PNG, JPG, and PDF files</p>
              <Button className="gradient-blue text-white border-0" disabled={loading}
                onClick={() => drawingInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />Upload Drawing / PDF
              </Button>
            </div>
          ) : (
            <div>
              <MarkdownText text={drawingAnalysis} className="text-sm text-muted-foreground leading-relaxed" />
              <div className="mt-4 pt-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => drawingInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Analyze Another
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Site Progress ─────────────────────────────────────────────────── */}
      {activeTab === "progress" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-foreground">Site Progress Tracker</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">3D Visualization</span>
          </div>
          <SiteProgress3D />
        </motion.div>
      )}

      {/* ── Safety Heatmap ────────────────────────────────────────────────── */}
      {activeTab === "safety" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-foreground">Safety Heatmap</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Live Risk Zones</span>
          </div>
          <SafetyHeatmap3D />
        </motion.div>
      )}

      {/* ── Equipment Map ─────────────────────────────────────────────────── */}
      {activeTab === "equipment" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-foreground">Equipment Location Map</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">3D Site Map</span>
          </div>
          <EquipmentMap3D />
        </motion.div>
      )}

      {/* ── Space Planning ────────────────────────────────────────────────── */}
      {activeTab === "space" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Box className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">Space Planning</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Interactive Layout</span>
          </div>
          <SpacePlanning3D />
        </motion.div>
      )}

      {/* AI Analysis banner */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI BIM Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-muted-foreground leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="BIM & CAD Intelligence"
        placeholder="Ask about BIM, drawings, clash detection, BOQ..."
        pageSummaryData={{
          totalElements: bimData?.total_elements || 336,
          storeys: bimData?.storeys?.length || 5,
          clashes: clashData?.total_clashes || 0,
          warnings: clashData?.total_warnings || 0,
        }}
      />
    </div>
  );
}
