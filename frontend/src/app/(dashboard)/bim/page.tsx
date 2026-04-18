"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Layers,
  Box,
  FileText,
  Eye,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import dynamic from "next/dynamic";

const BIMViewer3D = dynamic(() => import("@/components/bim/BIMViewer3D"), { ssr: false });
const SiteProgress3D = dynamic(() => import("@/components/bim/SiteProgress3D"), { ssr: false });
const SafetyHeatmap3D = dynamic(() => import("@/components/bim/SafetyHeatmap3D"), { ssr: false });
const EquipmentMap3D = dynamic(() => import("@/components/bim/EquipmentMap3D"), { ssr: false });
const SpacePlanning3D = dynamic(() => import("@/components/bim/SpacePlanning3D"), { ssr: false });

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

const tabs = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "viewer", label: "3D Viewer", icon: Eye },
  { id: "elements", label: "Elements", icon: Layers },
  { id: "clashes", label: "Clashes", icon: AlertTriangle },
  { id: "drawing", label: "Drawing AI", icon: Sparkles },
  { id: "progress", label: "Progress", icon: CheckCircle },
  { id: "safety", label: "Safety Map", icon: AlertTriangle },
  { id: "equipment", label: "Equipment", icon: Wrench },
  { id: "space", label: "Space Plan", icon: Box },
];

export default function BIMPage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [bimData, setBimData] = useState<any>(null);
  const [clashData, setClashData] = useState<any>(null);
  const [analysis, setAnalysis] = useState("");
  const [drawingAnalysis, setDrawingAnalysis] = useState("");

  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("http://localhost:8000/api/v1/bim/analyze-ifc-ai", formData);
      setBimData(response.data.bim_data);
      setAnalysis(response.data.ai_analysis);
      toast.success("IFC file parsed & analyzed!");
      setActiveTab("elements");
    } catch {
      toast.error("Failed to parse IFC file");
    } finally {
      setLoading(false);
    }
  };

  const handleClashDetection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("http://localhost:8000/api/v1/bim/clash-detection", formData);
      setClashData(response.data.data);
      toast.success("Clash detection complete!");
      setActiveTab("clashes");
    } catch {
      toast.error("Failed to run clash detection");
    } finally {
      setLoading(false);
    }
  };

  const handleDrawingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("http://localhost:8000/api/v1/bim/analyze-drawing", formData);
      setDrawingAnalysis(response.data.analysis);
      toast.success("Drawing analyzed!");
      setActiveTab("drawing");
    } catch {
      toast.error("Failed to analyze drawing");
    } finally {
      setLoading(false);
    }
  };

  const elementData = bimData?.summary
    ? Object.entries(bimData.summary).map(([name, count]: any) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        color: sampleElements.find(e => e.name.toLowerCase() === name)?.color || "#3b82f6",
      }))
    : sampleElements;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">BIM & CAD Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            IFC parsing · Clash detection · 3D viewer · Digital twin · Space planning
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".ifc" onChange={handleIFCUpload} />
            <Button variant="outline">
              <Box className="w-4 h-4 mr-2 text-blue-400" />
              Upload IFC
            </Button>
          </label>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".png,.jpg,.jpeg" onChange={handleDrawingUpload} />
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2 text-purple-400" />
              Analyze Drawing
            </Button>
          </label>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".ifc" onChange={handleClashDetection} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Clash Detection
            </Button>
          </label>
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
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
            {bimData && <p className="text-xs text-emerald-400 mt-1">Live IFC Data</p>}
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-blue-500 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Zone */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-4">Upload BIM/CAD Files</h3>
              <div className="space-y-3">
                {[
                  { label: "IFC File", desc: "Parse BIM model, extract elements", accept: ".ifc", icon: Box, color: "blue", onChange: handleIFCUpload },
                  { label: "CAD Drawing", desc: "AI analysis of blueprints", accept: ".png,.jpg,.jpeg", icon: FileText, color: "purple", onChange: handleDrawingUpload },
                  { label: "Clash Detection", desc: "Find geometry conflicts", accept: ".ifc", icon: AlertTriangle, color: "red", onChange: handleClashDetection },
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

            {/* Element Distribution */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-4">
                Element Distribution
                {bimData && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live IFC</span>}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={elementData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="count">
                    {elementData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {elementData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-muted-foreground">{item.name}: {item.count}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Storeys */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Building Storeys</h3>
            <div className="space-y-2">
              {(bimData?.storeys || sampleStoreys).map((storey: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-4 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
                >
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

      {/* 3D Viewer Tab */}
      {activeTab === "viewer" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">3D BIM Viewer</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Three.js</span>
            {bimData && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {bimData.storeys?.length || 4} Storeys
              </span>
            )}
          </div>
          <BIMViewer3D bimData={bimData} />
        </motion.div>
      )}

      {/* Elements Tab */}
      {activeTab === "elements" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-foreground">BIM Elements</h3>
            {bimData && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">From {bimData.filename}</span>}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={elementData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                {elementData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {bimData?.materials && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground mb-2">Materials Found:</p>
              <div className="flex flex-wrap gap-2">
                {bimData.materials.map((mat: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">{mat}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Clashes Tab */}
      {activeTab === "clashes" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Clash Detection Results</h3>
          {!clashData ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Upload an IFC file to run clash detection</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Clashes", value: clashData.total_clashes, color: "text-red-400" },
                  { label: "Warnings", value: clashData.total_warnings, color: "text-orange-400" },
                  { label: "Walls Checked", value: clashData.summary?.walls_checked || 0, color: "text-blue-400" },
                ].map((stat, i) => (
                  <div key={i} className="bg-secondary/40 rounded-xl p-4 text-center">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
              {clashData.warnings?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Warnings:</p>
                  {clashData.warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                      <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-foreground">{w.type}</p>
                        <p className="text-xs text-muted-foreground">{w.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ml-auto">{w.severity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Drawing AI Tab */}
      {activeTab === "drawing" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-foreground">Drawing AI Analysis</h3>
          </div>
          {!drawingAnalysis ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-4">Upload a blueprint or CAD drawing to analyze</p>
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept=".png,.jpg,.jpeg" onChange={handleDrawingUpload} />
                <Button className="gradient-blue text-white border-0">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Drawing
                </Button>
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{drawingAnalysis}</p>
          )}
        </motion.div>
      )}

      {/* Site Progress Tab */}
      {activeTab === "progress" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-foreground">Site Progress Tracker</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">3D Visualization</span>
          </div>
          <SiteProgress3D />
        </motion.div>
      )}

      {/* Safety Heatmap Tab */}
      {activeTab === "safety" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-foreground">Safety Heatmap</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Live Risk Zones</span>
          </div>
          <SafetyHeatmap3D />
        </motion.div>
      )}

      {/* Equipment Map Tab */}
      {activeTab === "equipment" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-foreground">Equipment Location Map</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">3D Site Map</span>
          </div>
          <EquipmentMap3D />
        </motion.div>
      )}

      {/* Space Planning Tab */}
      {activeTab === "space" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Box className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-foreground">Space Planning</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">Interactive Layout</span>
          </div>
          <SpacePlanning3D />
        </motion.div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI BIM Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="BIM & CAD Intelligence"
        placeholder="Ask about BIM, drawings, clash detection..."
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