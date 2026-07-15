"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2, Upload, Loader2, CheckCircle, AlertTriangle, Layers, Box,
  FileText, Eye, Sparkles, Wrench, ClipboardList, GitMerge, Download, ChevronDown, Gauge,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import Sparkline from "@/components/shared/Sparkline";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import dynamic from "next/dynamic";
import { MarkdownText } from "@/lib/renderMarkdown";
import { ACCENT, AccentKey, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import {
  fetchFallbackModelList, fetchFallbackModel, FallbackModelMeta,
  fallbackDownloadUrl, projectModelDownloadUrl,
  downloadBlobFromUrl, formatFileSize,
} from "@/lib/bimFallback";
import BimUploadHistory from "@/components/bim/BimUploadHistory";

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

const ELEMENT_COLORS: Record<string, string> = {
  walls: "#3B82F6", floors: "#10B981", doors: "#F59E0B",
  windows: "#8B5CF6", columns: "#EF4444", beams: "#00D4FF",
  roofs: "#94A3B8", stairs: "#F97316", spaces: "#A78BFA",
};

const tabs = [
  { id: "overview",  label: "Overview",   icon: Building2 },
  { id: "viewer",    label: "3D Viewer",  icon: Eye },
  { id: "elements",  label: "Elements",   icon: Layers },
  { id: "boq",       label: "BOQ",        icon: ClipboardList },
  { id: "clashes",   label: "Clashes",    icon: AlertTriangle },
  { id: "structural", label: "Structural", icon: Gauge },
  { id: "diff",      label: "Model Diff", icon: GitMerge },
  { id: "drawing",   label: "Drawing AI", icon: Sparkles },
  { id: "progress",  label: "Progress",   icon: CheckCircle },
  { id: "safety",    label: "Safety Map", icon: AlertTriangle },
  { id: "equipment", label: "Equipment",  icon: Wrench },
  { id: "space",     label: "Space Plan", icon: Box },
];

// ─── Shared glass button styles (mirrors Cost & Safety pages) ─

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const ghostBtn =
  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";

const tabBtnStyle = (active: boolean) => active
  ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
  : { background: "rgba(255,255,255,0.03)", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" };

export default function BIMPage() {
  const { counters, triggerRefresh } = useDataRefreshStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [bimData, setBimData] = useState<any>(null);
  const [meshData, setMeshData] = useState<any[]>([]);
  const [clashData, setClashData] = useState<any>(null);
  const [analysis, setAnalysis] = useState("");
  const [drawingAnalysis, setDrawingAnalysis] = useState("");
  const [boqData, setBoqData] = useState<any>(null);
  const [boqAnalysis, setBoqAnalysis] = useState("");
  const [structuralData, setStructuralData] = useState<any>(null);
  const [structuralAnalysis, setStructuralAnalysis] = useState("");
  const [diffData, setDiffData] = useState<any>(null);
  const [clashFile2Name, setClashFile2Name] = useState("");

  // Project context — shared across every tab so BIM stays in sync with
  // Digital Twin and the rest of the app instead of each tab picking its own.
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");

  // 3D Viewer model source — "live" (real uploaded project model) or a fallback slug.
  // Only feeds the 3D Viewer tab; Overview/Elements/BOQ/Clash tabs stay tied to the
  // real uploaded model since those are meant to reflect files explicitly analyzed.
  const [modelSource, setModelSource] = useState<string>("live");
  const [fallbackModels, setFallbackModels] = useState<FallbackModelMeta[]>([]);
  const [fallbackData, setFallbackData] = useState<{ bim_data: any; meshes: any[] } | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Documents uploaded from the Drawing AI tab, scoped to the current project
  const [drawingDocs, setDrawingDocs] = useState<any[]>([]);
  const [drawingDocsLoading, setDrawingDocsLoading] = useState(false);

  // Metadata for the current project's active IFC upload (Overview "current file" strip)
  const [currentModelMeta, setCurrentModelMeta] = useState<{ original_name?: string; created_at?: string; file_size?: number } | null>(null);

  // File input refs — all hidden inputs triggered programmatically to avoid
  // the <button>-inside-<label> click-propagation bug
  const ifcInputRef = useRef<HTMLInputElement>(null);
  const boqInputRef = useRef<HTMLInputElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const clashInputRef = useRef<HTMLInputElement>(null);
  const structuralInputRef = useRef<HTMLInputElement>(null);
  const clashFile2Ref = useRef<HTMLInputElement>(null);
  const diffFile1Ref = useRef<HTMLInputElement>(null);
  const diffFile2Ref = useRef<HTMLInputElement>(null);
  const [diffFile1, setDiffFile1] = useState<File | null>(null);
  const [diffFile2, setDiffFile2] = useState<File | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // ── Project selection ───────────────────────────────────────────────────
  useEffect(() => { fetchProjects(); }, [counters.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) fetchProjectModel(projectId); else resetModel(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) fetchDrawingDocs(projectId); else setDrawingDocs([]); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3D Viewer fallback models ────────────────────────────────────────────
  // "live" always stays selectable: with no uploaded IFC, BIMViewer3D renders its own
  // procedural scene (bridge/harbour/building) inferred from the project's name/type.
  // The fallback list below is only an optional manual preview of demo IFC buildings —
  // it must never auto-replace a project's own bridge/harbour/building scene.
  useEffect(() => { fetchFallbackModelList().then(setFallbackModels).catch(() => setFallbackModels([])); }, []);
  useEffect(() => { setModelSource("live"); }, [projectId]);
  useEffect(() => {
    if (modelSource === "live") { setFallbackData(null); return; }
    setFallbackLoading(true);
    fetchFallbackModel(modelSource).then(setFallbackData).catch(() => setFallbackData(null)).finally(() => setFallbackLoading(false));
  }, [modelSource]);

  const effectiveBimData = modelSource === "live" ? bimData : fallbackData?.bim_data;
  const effectiveMeshes = modelSource === "live" ? meshData : (fallbackData?.meshes || []);
  const selectedProject = projects.find(p => p.id === projectId) || null;

  const handleDownloadIFC = () => {
    const url = modelSource === "live" ? projectModelDownloadUrl(projectId) : fallbackDownloadUrl(modelSource);
    const filename = modelSource === "live" ? (bimData?.filename || "model.ifc") : `${modelSource}.ifc`;
    downloadBlobFromUrl(url, filename).catch(() => toast.error("Could not download IFC file."));
  };

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      setProjectId(prev => prev && p.some((x: any) => x.id === prev) ? prev : (p[0]?.id || ""));
    } catch {
      setProjects([]);
    }
  };

  const resetModel = () => {
    setBimData(null);
    setMeshData([]);
    setAnalysis("");
    setCurrentModelMeta(null);
  };

  const fetchProjectModel = async (pid: string) => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/project/${pid}/model`);
      if (res.data.success) {
        setBimData(res.data.bim_data);
        setMeshData(res.data.meshes || []);
        setAnalysis(res.data.ai_analysis || "");
        setCurrentModelMeta({
          original_name: res.data.original_name,
          created_at: res.data.created_at,
          file_size: res.data.file_size,
        });
      } else {
        resetModel();
      }
    } catch {
      resetModel();
    }
  };

  const fetchDrawingDocs = async (pid: string) => {
    setDrawingDocsLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/list`, { params: { project_id: pid } });
      const docs = (res.data.documents || []).filter((d: any) => ["drawing", "blueprint"].includes((d.doc_type || "").toLowerCase()));
      setDrawingDocs(docs);
    } catch {
      setDrawingDocs([]);
    } finally {
      setDrawingDocsLoading(false);
    }
  };

  const publicUrl = (bucket: string, filename: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;

  // ── IFC upload (header — populates elements + 3D viewer, saved to project) ─
  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!projectId) { toast.error("Select a project first"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/project/${projectId}/model`, fd);
      if (res.data.success) {
        setBimData(res.data.bim_data);
        setMeshData(res.data.meshes || []);
        setAnalysis(res.data.ai_analysis || "");
        setCurrentModelMeta({
          original_name: res.data.original_name,
          created_at: res.data.model?.created_at,
          file_size: res.data.model?.file_size,
        });
        toast.success("IFC file parsed, analyzed & saved!");
        setActiveTab("elements");
      } else {
        toast.error("Failed to parse IFC file");
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to parse IFC file");
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
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to run clash detection");
    } finally {
      setLoading(false);
    }
  };

  // ── Drawing AI (image or PDF) — saved & classified via the documents pipeline ─
  const handleDrawingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (projectId) formData.append("project_id", projectId);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/upload`, formData);
      setDrawingAnalysis(response.data.analysis || "Drawing saved. No AI analysis returned for this file type.");
      toast.success("Drawing analyzed & saved!");
      setActiveTab("drawing");
      if (projectId) fetchDrawingDocs(projectId);
      triggerRefresh("documents");
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to analyze drawing");
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
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to generate BOQ");
    } finally {
      setLoading(false);
    }
  };

  // ── Structural screening (preliminary beam check via PyNite) ──────────────
  const handleStructuralUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bim/structural-check`, fd);
      setStructuralData(res.data.structural);
      setStructuralAnalysis(res.data.ai_analysis);
      toast.success("Structural screening complete!");
      setActiveTab("structural");
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to run structural screening");
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
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to compare models");
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
          color: ELEMENT_COLORS[name] || "#00D4FF",
        }))
    : [];

  // Counts by severity, e.g. for a Clashes/Warnings breakdown sparkline — real
  // composition, not a fabricated time trend (BIM snapshots have no history).
  const severityBreakdown = (items?: any[]) => {
    const counts: Record<string, number> = {};
    (items || []).forEach((it: any) => {
      const s = it.severity || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return { data: Object.values(counts), labels: Object.keys(counts) };
  };

  const storeyList = bimData?.storeys || [];
  const clashSeverity = severityBreakdown(clashData?.clashes);
  const warningSeverity = severityBreakdown(clashData?.warnings);

  const kpis: {
    label: string; value: string; accent: AccentKey;
    sparkline: { data: number[]; labels: (string | number)[]; type: "bar" | "area" };
  }[] = [
    {
      label: "Total Elements", value: bimData?.total_elements?.toString() || "0", accent: "blue",
      sparkline: { data: elementData.map((e: any) => e.count), labels: elementData.map((e: any) => e.name), type: "bar" },
    },
    {
      label: "Storeys", value: bimData?.storeys?.length?.toString() || "0", accent: "green",
      sparkline: { data: storeyList.map((s: any) => s.elevation), labels: storeyList.map((s: any) => s.name), type: "area" },
    },
    {
      label: "Clashes Found", value: clashData?.total_clashes?.toString() || "0", accent: "red",
      sparkline: { data: clashSeverity.data, labels: clashSeverity.labels, type: "bar" },
    },
    {
      label: "Warnings", value: clashData?.total_warnings?.toString() || "0", accent: "amber",
      sparkline: { data: warningSeverity.data, labels: warningSeverity.labels, type: "bar" },
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={SITE_TABS} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">BIM & CAD Intelligence</h1>
          <p className="text-white/35 text-[13px] mt-1">
            IFC parsing · Clash detection · 3D viewer · BOQ · Structural screening · Model diff · Drawing AI
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {projects.length > 0 && (
            <div className="relative">
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl text-xs text-white outline-none border focus:border-cyan-500/50 cursor-pointer"
                style={glassInputStyle}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 pointer-events-none" />
            </div>
          )}
          {/* Hidden inputs — triggered via refs to avoid button-inside-label click loss */}
          <input ref={ifcInputRef} type="file" className="hidden" accept=".ifc" onChange={handleIFCUpload} />
          <input ref={boqInputRef} type="file" className="hidden" accept=".ifc" onChange={handleBOQUpload} />
          <input ref={drawingInputRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleDrawingUpload} />
          <input ref={clashInputRef} type="file" className="hidden" accept=".ifc" onChange={handleClashDetection} />
          <input ref={structuralInputRef} type="file" className="hidden" accept=".ifc" onChange={handleStructuralUpload} />

          <button className={ghostBtn} style={glassButtonStyle} disabled={loading || !projectId} onClick={() => ifcInputRef.current?.click()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4 text-cyan-400" />}
            Upload IFC
          </button>
          <button className={ghostBtn} style={glassButtonStyle} disabled={loading} onClick={() => boqInputRef.current?.click()}>
            <ClipboardList className="w-4 h-4 text-emerald-400" />Generate BOQ
          </button>
          <button className={ghostBtn} style={glassButtonStyle} disabled={loading} onClick={() => drawingInputRef.current?.click()}>
            <FileText className="w-4 h-4 text-cyan-400" />Analyze Drawing
          </button>
          <button className={primaryBtn} style={gradientButtonStyle} disabled={loading} onClick={() => clashInputRef.current?.click()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Clash Detection
          </button>
          <button className={ghostBtn} style={glassButtonStyle} disabled={loading} onClick={() => structuralInputRef.current?.click()}>
            <Gauge className="w-4 h-4 text-cyan-400" />Structural Check
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const a = ACCENT[kpi.accent];
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}>
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <p className="relative text-[13px] text-white/40">{kpi.label}</p>
              <p className="relative text-[28px] font-bold mt-1" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
              {bimData && <p className="relative text-xs text-emerald-400 mt-1">Live IFC Data</p>}
              {kpi.sparkline.data.length >= 2 && (
                <div className="relative -mx-1 mt-2 opacity-80">
                  <Sparkline data={kpi.sparkline.data} color={a.text} type={kpi.sparkline.type} labels={kpi.sparkline.labels} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
            style={tabBtnStyle(activeTab === tab.id)}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white mb-4">Upload BIM/CAD Files</h3>
              {currentModelMeta?.original_name && (
                <div className="flex items-center gap-3 p-3 mb-3 rounded-xl"
                  style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}>
                  <Box className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/70 truncate">
                      Current file: <span className="text-white font-medium">{currentModelMeta.original_name}</span>
                    </p>
                    <p className="text-[11px] text-white/35">
                      Uploaded {currentModelMeta.created_at ? new Date(currentModelMeta.created_at).toLocaleString() : "—"}
                      {currentModelMeta.file_size ? ` · ${formatFileSize(currentModelMeta.file_size)}` : ""}
                    </p>
                  </div>
                  <button onClick={handleDownloadIFC}
                    className="p-1.5 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors" title="Download current file">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {[
                  { label: "IFC File", desc: "Parse BIM model, extract elements + 3D", accept: ".ifc", icon: Box, onChange: handleIFCUpload },
                  { label: "BOQ from IFC", desc: "Generate Bill of Quantities", accept: ".ifc", icon: ClipboardList, onChange: handleBOQUpload },
                  { label: "CAD Drawing / PDF", desc: "AI analysis of blueprints (image or PDF)", accept: ".png,.jpg,.jpeg,.pdf", icon: FileText, onChange: handleDrawingUpload },
                  { label: "Clash Detection", desc: "Find geometry conflicts", accept: ".ifc", icon: AlertTriangle, onChange: handleClashDetection },
                ].map((item, i) => (
                  <label key={i} className="cursor-pointer block">
                    <input type="file" className="hidden" accept={item.accept} onChange={item.onChange} />
                    <div className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:bg-white/[0.03]"
                      style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <item.icon className="w-5 h-5 text-white/35" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{item.label}</p>
                        <p className="text-xs text-white/35">{item.desc}</p>
                      </div>
                      <Upload className="w-4 h-4 text-white/35" />
                    </div>
                  </label>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white mb-4">
                Element Distribution
                {bimData && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live IFC</span>}
              </h3>
              {elementData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={elementData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="count">
                        {elementData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                    {elementData.map(item => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-white/35">{item.name}: {item.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-10 text-center">
                  <Layers className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/35">No IFC model uploaded for this project yet</p>
                </div>
              )}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }} className="glass-card p-6">
            <h3 className="font-semibold text-white mb-4">Building Storeys</h3>
            {storeyList.length > 0 ? (
              <div className="space-y-2">
                {storeyList.map((storey: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 p-3 rounded-xl transition-colors hover:bg-white/[0.03]"
                    style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: ACCENT.cyan.bg }}>
                      <Layers className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{storey.name}</p>
                      <p className="text-xs text-white/35">Elevation: {storey.elevation}m</p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-white/35">No storeys yet — upload an IFC file to populate this project's BIM model</p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ── 3D Viewer ────────────────────────────────────────────────────── */}
      {activeTab === "viewer" && (
        <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Eye className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">3D BIM Viewer</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Three.js</span>
            {effectiveBimData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{effectiveBimData.storeys?.length || 0} Storeys</span>}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <select
                  value={modelSource}
                  onChange={e => setModelSource(e.target.value)}
                  disabled={fallbackLoading}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-xl text-xs text-white outline-none border focus:border-cyan-500/50 cursor-pointer"
                  style={glassInputStyle}
                >
                  <option value="live">{meshData.length > 0 ? "Live Project Model" : "This Project"}</option>
                  {fallbackModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.total_elements.toLocaleString()} elements)</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 pointer-events-none" />
              </div>
              <button className={ghostBtn} style={glassButtonStyle} onClick={handleDownloadIFC}
                disabled={modelSource === "live" && !bimData}>
                <Download className="w-3.5 h-3.5" />Download IFC
              </button>
            </div>
          </div>
          <BIMViewer3D key={`${projectId}-${modelSource}`} bimData={effectiveBimData} initialMeshes={effectiveMeshes} project={selectedProject} />
        </motion.div>
        <BimUploadHistory projectId={projectId} projects={projects} onCurrentModelChanged={() => fetchProjectModel(projectId)} />
        </div>
      )}

      {/* ── Elements ─────────────────────────────────────────────────────── */}
      {activeTab === "elements" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">BIM Elements</h3>
              {bimData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">From {bimData.filename}</span>}
            </div>
            {bimData && (
              <button className={ghostBtn} style={glassButtonStyle} onClick={handleExportElementsCSV}>
                <Download className="w-3.5 h-3.5" />Export CSV
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={elementData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                {elementData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {bimData?.materials?.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-white mb-2">Materials Found:</p>
              <div className="flex flex-wrap gap-2">
                {bimData.materials.map((mat: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-lg text-white/40" style={{ background: "rgba(255,255,255,0.05)" }}>{mat}</span>
                ))}
              </div>
            </div>
          )}
          {!bimData && (
            <div className="mt-6 text-center">
              <button className={ghostBtn + " mx-auto"} style={glassButtonStyle} onClick={() => ifcInputRef.current?.click()}>
                <Upload className="w-4 h-4" />Upload IFC to see live data
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* ── BOQ ──────────────────────────────────────────────────────────── */}
      {activeTab === "boq" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">Bill of Quantities</h3>
              {boqData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{boqData.project_name}</span>}
            </div>
            {boqData && (
              <button className={ghostBtn} style={glassButtonStyle} onClick={handleExportBOQCSV}>
                <Download className="w-3.5 h-3.5" />Export CSV
              </button>
            )}
          </div>

          {!boqData ? (
            <div className="text-center py-8">
              <ClipboardList className="w-10 h-10 text-white/30 mx-auto mb-2" />
              <p className="text-sm text-white/35 mb-4">Upload an IFC file to generate a Bill of Quantities</p>
              <button className={primaryBtn + " mx-auto"} style={gradientButtonStyle} disabled={loading}
                onClick={() => boqInputRef.current?.click()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Generate BOQ
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total Elements", value: boqData.total_elements },
                  { label: "Storeys", value: boqData.storeys },
                  { label: "Line Items", value: boqData.items?.length },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="text-xs text-white/35 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {boqData.items?.length > 0 && (() => {
                const byCategory = Object.values(
                  boqData.items.reduce((acc: Record<string, { category: string; quantity: number }>, item: any) => {
                    const cat = item.category || "Other";
                    if (!acc[cat]) acc[cat] = { category: cat, quantity: 0 };
                    acc[cat].quantity += Number(item.quantity) || 0;
                    return acc;
                  }, {})
                ) as { category: string; quantity: number }[];
                return (
                  <div>
                    <p className="text-sm font-medium text-white mb-2">Quantity by Category</p>
                    <ResponsiveContainer width="100%" height={Math.max(140, byCategory.length * 34)}>
                      <BarChart data={byCategory} layout="vertical" margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="category" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                        <Bar dataKey="quantity" fill="#00D4FF" radius={[0, 6, 6, 0]} name="Quantity" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      {["Category", "Item", "Description", "Qty", "Unit", "Measure"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-white/35">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boqData.items?.map((item: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                        <td className="px-3 py-2 text-cyan-400 font-medium">{item.category}</td>
                        <td className="px-3 py-2 text-white font-medium">{item.item}</td>
                        <td className="px-3 py-2 text-white/35">{item.description}</td>
                        <td className="px-3 py-2 text-white font-bold">{item.quantity}</td>
                        <td className="px-3 py-2 text-white/35">{item.unit}</td>
                        <td className="px-3 py-2 text-white/35">
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
                  <p className="text-sm font-medium text-white mb-2">Materials in Model:</p>
                  <div className="flex flex-wrap gap-2">
                    {boqData.materials.map((m: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg text-white/40" style={{ background: "rgba(255,255,255,0.05)" }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {boqAnalysis && (
                <div className="mt-4 p-4 rounded-xl" style={{ background: ACCENT.green.bg, border: `1px solid ${ACCENT.green.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm font-medium text-white">AI Quantity Surveyor Analysis</p>
                  </div>
                  <MarkdownText text={boqAnalysis} className="text-xs text-white/40 leading-relaxed" />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Clashes ──────────────────────────────────────────────────────── */}
      {activeTab === "clashes" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Clash Detection</h3>

          {/* Two-model upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <p className="text-xs font-medium text-white mb-2">Model A — Structural (required)</p>
              <div className="flex items-center gap-2 p-2.5 rounded-lg transition-all cursor-pointer hover:bg-white/[0.03]"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                onClick={() => clashInputRef.current?.click()}>
                <Box className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-white/35">Upload Model A (.ifc)</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white mb-2">Model B — MEP/Services (optional)</p>
              <label className="cursor-pointer block">
                <input ref={clashFile2Ref} type="file" className="hidden" accept=".ifc"
                  onChange={e => setClashFile2Name(e.target.files?.[0]?.name || "")} />
                <div className="flex items-center gap-2 p-2.5 rounded-lg transition-all cursor-pointer hover:bg-white/[0.03]"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                  onClick={() => clashFile2Ref.current?.click()}>
                  <GitMerge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-white/35">{clashFile2Name || "Upload Model B (.ifc)"}</span>
                </div>
              </label>
            </div>
          </div>

          {!clashData ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-white/30 mx-auto mb-2" />
              <p className="text-sm text-white/35">Upload Model A (structural IFC) to run clash detection</p>
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
                  { label: "Clashes", value: clashData.total_clashes, accent: "red" as const },
                  { label: "Warnings", value: clashData.total_warnings, accent: "amber" as const },
                  { label: "Walls Checked", value: clashData.summary?.walls_checked || 0, accent: "cyan" as const },
                  { label: "Beams Checked", value: clashData.summary?.beams_checked || 0, accent: "green" as const },
                ].map((s, i) => {
                  const a = ACCENT[s.accent];
                  return (
                    <div key={i} className="rounded-xl p-4 text-center" style={{ background: a.bg, border: `1px solid ${a.border}` }}>
                      <p className="text-2xl font-bold" style={{ color: a.text }}>{s.value}</p>
                      <p className="text-xs text-white/35 mt-1">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {(clashData.clashes?.length > 0 || clashData.warnings?.length > 0) && (() => {
                const SEVERITY_COLOR: Record<string, string> = { Critical: "#EF4444", High: "#F59E0B", Medium: "#EAB308", Low: "#10B981" };
                const sevCounts: Record<string, number> = {};
                [...(clashData.clashes || []), ...(clashData.warnings || [])].forEach((c: any) => {
                  const sev = c.severity || "Unknown";
                  sevCounts[sev] = (sevCounts[sev] || 0) + 1;
                });
                const data = Object.entries(sevCounts).map(([severity, count]) => ({ severity, count, color: SEVERITY_COLOR[severity] || "#94A3B8" }));
                return data.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-white mb-2">Clashes & Warnings by Severity</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="severity" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Count">
                          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null;
              })()}

              {clashData.clashes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white">Geometry Clashes:</p>
                  {clashData.clashes.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{c.type}</p>
                        <p className="text-xs text-white/35">{c.description}</p>
                        {c.element_a && c.element_b && <p className="text-xs text-red-300 mt-0.5">{c.element_a} ↔ {c.element_b}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ml-auto whitespace-nowrap ${
                        c.severity === "Critical" ? "bg-red-500/20 text-red-300" :
                        c.severity === "High" ? "bg-amber-500/20 text-amber-300" : "bg-yellow-500/20 text-yellow-300"
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
                  <p className="text-sm font-medium text-white">Quality Warnings:</p>
                  {clashData.warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{w.type}</p>
                        <p className="text-xs text-white/35">{w.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ml-auto whitespace-nowrap">{w.severity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Structural Screening ────────────────────────────────────────────*/}
      {activeTab === "structural" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Structural Screening — Beams</h3>

          {!structuralData ? (
            <div className="text-center py-8">
              <Gauge className="w-10 h-10 text-white/30 mx-auto mb-2" />
              <p className="text-sm text-white/35 mb-4">Upload an IFC file to run a preliminary structural check on its beams</p>
              <button className={primaryBtn + " mx-auto"} style={gradientButtonStyle} disabled={loading}
                onClick={() => structuralInputRef.current?.click()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Run Structural Check
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-xs text-cyan-200/80 leading-relaxed">{structuralData.disclaimer}</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Beams Checked", value: structuralData.total_checked, accent: "cyan" as const },
                  { label: "Passed", value: structuralData.passed, accent: "green" as const },
                  { label: "Warnings", value: structuralData.warnings, accent: "amber" as const },
                  { label: "Failed", value: structuralData.failed, accent: "red" as const },
                ].map((s, i) => {
                  const a = ACCENT[s.accent];
                  return (
                    <div key={i} className="rounded-xl p-4 text-center" style={{ background: a.bg, border: `1px solid ${a.border}` }}>
                      <p className="text-2xl font-bold" style={{ color: a.text }}>{s.value}</p>
                      <p className="text-xs text-white/35 mt-1">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {structuralData.results?.length > 0 && (() => {
                const STATUS_COLOR: Record<string, string> = { Pass: "#10B981", Warning: "#F59E0B", Fail: "#EF4444" };
                const counts: Record<string, number> = {};
                structuralData.results.forEach((r: any) => { counts[r.status] = (counts[r.status] || 0) + 1; });
                const data = Object.entries(counts).map(([status, count]) => ({ status, count, color: STATUS_COLOR[status] || "#94A3B8" }));
                return (
                  <div>
                    <p className="text-sm font-medium text-white mb-2">Beams by Status</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="status" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Count">
                          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      {["Beam", "Material", "Span (m)", "Deflection", "Bending Stress", "Status"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-white/35">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {structuralData.results.map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                        <td className="px-3 py-2 text-white font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-white/35">{r.material}</td>
                        <td className="px-3 py-2 text-white/35">{r.length_m}</td>
                        <td className="px-3 py-2 text-white/35">{r.deflection_mm} / {r.deflection_limit_mm} mm ({Math.round(r.utilization_deflection * 100)}%)</td>
                        <td className="px-3 py-2 text-white/35">{r.bending_stress_mpa} / {r.allowable_stress_mpa} MPa ({Math.round(r.utilization_stress * 100)}%)</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                            r.status === "Fail" ? "bg-red-500/20 text-red-300" :
                            r.status === "Warning" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {structuralAnalysis && (
                <div className="mt-4 p-4 rounded-xl" style={{ background: ACCENT.green.bg, border: `1px solid ${ACCENT.green.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm font-medium text-white">AI Structural Review</p>
                  </div>
                  <MarkdownText text={structuralAnalysis} className="text-xs text-white/40 leading-relaxed" />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Model Diff ───────────────────────────────────────────────────── */}
      {activeTab === "diff" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <GitMerge className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">IFC Model Diff</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Compare two versions</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { label: "Model A (original)", file: diffFile1, setFile: setDiffFile1, ref: diffFile1Ref, accent: "blue" as const },
              { label: "Model B (updated)", file: diffFile2, setFile: setDiffFile2, ref: diffFile2Ref, accent: "cyan" as const },
            ].map(({ label, file, setFile, ref, accent }) => {
              const a = ACCENT[accent];
              return (
                <div key={label}>
                  <p className="text-xs font-medium text-white mb-2">{label}</p>
                  <label className="cursor-pointer block">
                    <input ref={ref} type="file" className="hidden" accept=".ifc"
                      onChange={e => setFile(e.target.files?.[0] || null)} />
                    <div className="flex items-center gap-3 p-4 rounded-xl transition-all cursor-pointer hover:bg-white/[0.03]"
                      style={file ? { background: a.bg, border: `1px solid ${a.border}` } : { border: "1px solid rgba(255,255,255,0.07)" }}
                      onClick={() => ref.current?.click()}>
                      <Box className="w-5 h-5" style={{ color: file ? a.text : "rgba(255,255,255,0.35)" }} />
                      <div>
                        <p className="text-sm text-white">{file ? file.name : "Click to upload .ifc"}</p>
                        {file && <p className="text-xs text-white/35">{(file.size / 1024).toFixed(0)} KB</p>}
                      </div>
                      {file && <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>

          <button onClick={handleRunDiff} disabled={!diffFile1 || !diffFile2 || diffLoading}
            className={primaryBtn + " w-full justify-center"} style={gradientButtonStyle}>
            {diffLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            Compare Models
          </button>

          {diffData && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Added", value: diffData.summary?.added_count, accent: "green" as const },
                  { label: "Removed", value: diffData.summary?.removed_count, accent: "red" as const },
                  { label: "Modified", value: diffData.summary?.modified_count, accent: "amber" as const },
                  { label: "Unchanged", value: diffData.summary?.unchanged_count, accent: null },
                ].map((s, i) => {
                  const a = s.accent ? ACCENT[s.accent] : null;
                  return (
                    <div key={i} className="rounded-xl p-4 text-center"
                      style={a ? { background: a.bg, border: `1px solid ${a.border}` } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-2xl font-bold" style={{ color: a ? a.text : "rgba(255,255,255,0.5)" }}>{s.value ?? 0}</p>
                      <p className="text-xs text-white/35 mt-1">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {(() => {
                const data = [
                  { label: "Added", value: diffData.summary?.added_count || 0, color: "#10B981" },
                  { label: "Removed", value: diffData.summary?.removed_count || 0, color: "#EF4444" },
                  { label: "Modified", value: diffData.summary?.modified_count || 0, color: "#F59E0B" },
                  { label: "Unchanged", value: diffData.summary?.unchanged_count || 0, color: "#94A3B8" },
                ];
                return data.some(d => d.value > 0) ? (
                  <div>
                    <p className="text-sm font-medium text-white mb-2">Change Breakdown</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis dataKey="label" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} name="Elements">
                          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null;
              })()}

              {diffData.added?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-emerald-400">Added ({diffData.added.length})</p>
                  {diffData.added.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <span className="text-xs font-mono text-emerald-400">+</span>
                      <span className="text-xs text-white">{el.name}</span>
                      <span className="text-xs text-white/35 ml-auto">{el.type?.replace("Ifc", "")}</span>
                    </div>
                  ))}
                  {diffData.added.length > 10 && <p className="text-xs text-white/35 pl-2">+{diffData.added.length - 10} more</p>}
                </div>
              )}

              {diffData.removed?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-red-400">Removed ({diffData.removed.length})</p>
                  {diffData.removed.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                      <span className="text-xs font-mono text-red-400">−</span>
                      <span className="text-xs text-white">{el.name}</span>
                      <span className="text-xs text-white/35 ml-auto">{el.type?.replace("Ifc", "")}</span>
                    </div>
                  ))}
                  {diffData.removed.length > 10 && <p className="text-xs text-white/35 pl-2">+{diffData.removed.length - 10} more</p>}
                </div>
              )}

              {diffData.modified?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-amber-400">Modified ({diffData.modified.length})</p>
                  {diffData.modified.slice(0, 10).map((el: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <span className="text-xs font-mono text-amber-400">~</span>
                      <span className="text-xs text-white">{el.name}</span>
                      <span className="text-xs text-amber-400/70 ml-auto">{el.changes?.join(", ")}</span>
                    </div>
                  ))}
                  {diffData.modified.length > 10 && <p className="text-xs text-white/35 pl-2">+{diffData.modified.length - 10} more</p>}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Drawing AI ───────────────────────────────────────────────────── */}
      {activeTab === "drawing" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">Drawing AI Analysis</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Image · PDF</span>
          </div>
          {!drawingAnalysis ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-white/30 mx-auto mb-2" />
              <p className="text-sm text-white/35 mb-1">Upload a blueprint, CAD drawing, or PDF to analyze</p>
              <p className="text-xs text-white/25 mb-4">Supports PNG, JPG, and PDF files</p>
              <button className={primaryBtn + " mx-auto"} style={gradientButtonStyle} disabled={loading}
                onClick={() => drawingInputRef.current?.click()}>
                <Upload className="w-4 h-4" />Upload Drawing / PDF
              </button>
            </div>
          ) : (
            <div>
              <MarkdownText text={drawingAnalysis} className="text-sm text-white/60 leading-relaxed" />
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <button className={ghostBtn} style={glassButtonStyle} onClick={() => drawingInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />Analyze Another
                </button>
              </div>
            </div>
          )}

          {/* Previously uploaded drawings — saved to the documents DB & classified */}
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-medium text-white">Previously Analyzed Drawings</h4>
              {drawingDocs.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{drawingDocs.length} saved</span>
              )}
            </div>
            {drawingDocsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              </div>
            ) : drawingDocs.length === 0 ? (
              <p className="text-xs text-white/35">No drawings saved for this project yet.</p>
            ) : (
              <div className="space-y-1.5">
                {drawingDocs.map((doc: any) => {
                  const fileUrl = doc.filename && doc.bucket ? publicUrl(doc.bucket, doc.filename) : null;
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/[0.03]"
                      style={{ background: "rgba(255,255,255,0.015)" }}>
                      <FileText className="w-4 h-4 text-cyan-400/70 shrink-0" />
                      <span className="text-xs text-white flex-1 truncate">{doc.original_name || doc.filename}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-md capitalize" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                        {doc.doc_type}
                      </span>
                      <span className="text-xs text-white/35 whitespace-nowrap">
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ""}
                      </span>
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        disabled={!fileUrl}
                        onClick={() => fileUrl && window.open(fileUrl, "_blank")}
                        title={fileUrl ? "View file" : "No file available"}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Site Progress ─────────────────────────────────────────────────── */}
      {activeTab === "progress" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Site Progress Tracker</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">3D Visualization</span>
          </div>
          <SiteProgress3D projectId={projectId} />
        </motion.div>
      )}

      {/* ── Safety Heatmap ────────────────────────────────────────────────── */}
      {activeTab === "safety" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-white">Safety Heatmap</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Live Risk Zones</span>
          </div>
          <SafetyHeatmap3D projectId={projectId} />
        </motion.div>
      )}

      {/* ── Equipment Map ─────────────────────────────────────────────────── */}
      {activeTab === "equipment" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white">Equipment Location Map</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">3D Site Map</span>
          </div>
          <EquipmentMap3D projectId={projectId} />
        </motion.div>
      )}

      {/* ── Space Planning ────────────────────────────────────────────────── */}
      {activeTab === "space" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Box className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">Space Planning</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Interactive Layout</span>
          </div>
          <SpacePlanning3D />
        </motion.div>
      )}

      {/* AI Analysis banner */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI BIM Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="BIM & CAD Intelligence"
        placeholder="Ask about BIM, drawings, clash detection, BOQ..."
        pageSummaryData={{
          totalElements: bimData?.total_elements || 0,
          storeys: bimData?.storeys?.length || 0,
          clashes: clashData?.total_clashes || 0,
          warnings: clashData?.total_warnings || 0,
        }}
      />
    </div>
  );
}
