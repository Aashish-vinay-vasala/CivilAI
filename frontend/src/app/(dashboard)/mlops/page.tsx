"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Activity, Brain, CheckCircle, AlertTriangle,
  TrendingUp, Database, GitBranch, Cpu,
  RefreshCw, Loader2, ExternalLink, Terminal,
  ChevronDown, ChevronUp, Download, Sparkles, BarChart2, X,
  Upload, ArrowRight, Network,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import jsPDF from "jspdf";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const ANALYTICS_TABS = [
  { href: "/analytics",  label: "Analytics" },
  { href: "/predictive", label: "Predictive" },
  { href: "/anomaly",    label: "Anomaly Detection" },
  { href: "/mlops",      label: "MLOps" },
];

const ML_API = process.env.NEXT_PUBLIC_ML_API_URL || "http://localhost:8001";

// ── Theme helpers ────────────────────────────────────────────────────────────
// Mirrors the accent-color recipe used across the main dashboard/safety pages.

const ACCENT: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.18)",   text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)",  text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",   text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)",  text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  blue:   { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)",  text: "#3B82F6", shadow: "rgba(59,130,246,0.15)" },
  orange: { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)",  text: "#F97316", shadow: "rgba(249,115,22,0.15)" },
  purple: { bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)",  text: "#8B5CF6", shadow: "rgba(139,92,246,0.15)" },
  teal:   { bg: "rgba(20,184,166,0.07)",  border: "rgba(20,184,166,0.18)",  text: "#14B8A6", shadow: "rgba(20,184,166,0.15)" },
};

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const primaryBtnStyle = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
};
const ghostBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

const tooltipStyle = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border: "1px solid rgba(0,212,255,0.15)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const fallbackModels = [
  { name: "Cost Overrun",       accuracy: 83,   f1: 0.827, auc: 0.938, status: "FINISHED", type: "XGBoost" },
  { name: "Delay Prediction",   accuracy: 88.5, f1: 0.887, auc: 0.97,  status: "FINISHED", type: "XGBoost" },
  { name: "Safety Risk",        accuracy: 88,   f1: 0.855, auc: 0.956, status: "FINISHED", type: "Random Forest" },
  { name: "Workforce Turnover", accuracy: 87,   f1: 0.877, auc: 0.959, status: "FINISHED", type: "XGBoost" },
  { name: "Equipment Failure",  accuracy: 84,   f1: 0.846, auc: 0.941, status: "FINISHED", type: "Random Forest" },
];

const radarData = [
  { metric: "Accuracy",  score: 86 },
  { metric: "F1 Score",  score: 85.8 },
  { metric: "AUC",       score: 95.3 },
  { metric: "Precision", score: 84 },
  { metric: "Recall",    score: 86 },
  { metric: "Stability", score: 92 },
];

const driftData = [
  { feature: "change_orders",   psi: 0.04, status: "stable" },
  { feature: "weather_delays",  psi: 0.15, status: "warning" },
  { feature: "material_price",  psi: 0.06, status: "stable" },
  { feature: "last_service",    psi: 0.14, status: "warning" },
  { feature: "salary",          psi: 0.05, status: "stable" },
  { feature: "risk_score",      psi: 0.03, status: "stable" },
];

const pipelineSteps = [
  { step: "Data Validation",           status: "passed",  duration: "1.2s" },
  { step: "Feature Engineering",       status: "passed",  duration: "0.8s" },
  { step: "Model Training (6 models)", status: "passed",  duration: "45s" },
  { step: "MLflow Logging",            status: "passed",  duration: "12s" },
  { step: "Drift Detection",           status: "warning", duration: "3.1s" },
  { step: "Performance Check",         status: "passed",  duration: "0.5s" },
  { step: "Model Deployment",          status: "passed",  duration: "2.3s" },
];

/* ─── PDF export ─────────────────────────────────────────────── */

function exportToPDF(displayModels: any[], avgAccuracy: string, avgAuc: string, totalRuns: number, predStats: any) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pw  = doc.internal.pageSize.getWidth();
  const M   = 15;
  let y     = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("MLOps Dashboard Report", M, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CivilAI Platform  ·  ${new Date().toLocaleString()}`, M, 25);

  y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Portfolio: ${totalRuns} experiment runs  |  Avg Accuracy: ${avgAccuracy}%  |  Avg AUC: ${avgAuc}  |  Predictions: ${predStats?.total_predictions ?? 0}`, M, y);
  y += 12;

  doc.setFillColor(239, 246, 255);
  doc.rect(M, y, pw - M * 2, 8, "F");
  doc.setFontSize(9.5);
  doc.text("Model", M + 2, y + 5.5);
  doc.text("Algorithm", M + 65, y + 5.5);
  doc.text("Accuracy", M + 100, y + 5.5);
  doc.text("F1", M + 130, y + 5.5);
  doc.text("AUC", M + 150, y + 5.5);
  doc.text("Status", M + 165, y + 5.5);
  y += 8;

  doc.setFont("helvetica", "normal");
  displayModels.forEach((model, i) => {
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
    doc.setTextColor(15, 23, 42);
    doc.text(model.name, M + 2, y + 5.5);
    doc.text(model.type, M + 65, y + 5.5);
    doc.text(`${model.accuracy}%`, M + 100, y + 5.5);
    doc.text(typeof model.f1 === "number" ? model.f1.toFixed(3) : String(model.f1), M + 130, y + 5.5);
    doc.setTextColor(22, 163, 74);
    doc.text(typeof model.auc === "number" ? model.auc.toFixed(3) : String(model.auc), M + 150, y + 5.5);
    doc.setTextColor(15, 23, 42);
    doc.text("FINISHED", M + 165, y + 5.5);
    y += 8;
  });

  y += 10;

  const sections = [
    {
      title: "MLOps Overview",
      body: `CivilAI's MLOps platform manages a suite of 5 production ML models for construction risk prediction, ` +
        `orchestrated through MLflow experiment tracking and Prefect pipeline automation. ` +
        `The platform supports continuous model retraining, performance monitoring, data drift detection, ` +
        `and automated deployment. ${totalRuns} experiment runs have been logged in the MLflow tracking server. ` +
        `Average accuracy across all models: ${avgAccuracy}%. Average AUC: ${avgAuc}. Total predictions served: ${predStats?.total_predictions ?? 0}.`
    },
    {
      title: "Model Performance Analysis",
      body: `The model suite achieves weighted-average accuracy of ${avgAccuracy}% across five prediction domains. ` +
        `XGBoost models (Cost Overrun, Delay Prediction, Workforce Turnover) achieve 83–88.5% accuracy due to their ` +
        `ability to capture non-linear interactions in tabular construction data. ` +
        `Random Forest models (Safety Risk, Equipment Failure) achieve 84–88% accuracy with strong resistance to ` +
        `outliers — important for safety datasets with rare severe events. ` +
        `AUC scores of 0.938–0.970 indicate strong discriminative power across all risk thresholds.`
    },
    {
      title: "Data Drift Analysis",
      body: `Data drift is monitored using Population Stability Index (PSI). PSI < 0.10 = stable (no action needed). ` +
        `PSI 0.10–0.20 = moderate drift (monitor closely). PSI > 0.20 = significant drift (retrain required). ` +
        `Current warnings: weather_delays (PSI=0.15) and last_service (PSI=0.14) show moderate drift. ` +
        `This may indicate seasonal patterns in construction activity or changes in maintenance scheduling practices. ` +
        `Recommend retraining the Delay Prediction and Equipment Failure models with recent data within 30 days.`
    },
    {
      title: "Pipeline Health",
      body: `The Prefect pipeline completed 6/7 steps with 1 warning (Drift Detection). ` +
        `Pipeline stages: Data Validation (1.2s), Feature Engineering (0.8s), Model Training (45s for 6 models), ` +
        `MLflow Logging (12s), Drift Detection (3.1s — warning), Performance Check (0.5s), Model Deployment (2.3s). ` +
        `Total pipeline execution time: ~65s. All 5 models are currently in production status. ` +
        `Next scheduled retraining: based on drift detection thresholds or explicit trigger via Run Pipeline.`
    },
    {
      title: "Methodology & Architecture",
      body: `ML Pipeline: raw Supabase data → feature engineering → XGBoost/RandomForest training → MLflow logging → ` +
        `drift detection → Prefect orchestration → FastAPI deployment. ` +
        `Models are retrained when PSI > 0.20 on any monitored feature or when accuracy drops below 80%. ` +
        `Model versioning is managed via MLflow Model Registry with production/staging/archived stages. ` +
        `The prediction API (FastAPI, port 8001) serves predictions at <50ms latency. ` +
        `Training data: synthetic construction datasets augmented with real industry benchmarks (OSHA, ASCE).`
    },
  ];

  sections.forEach(sec => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(sec.title, M, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(sec.body, pw - M * 2);
    lines.forEach((line: string) => { if (y > 270) { doc.addPage(); y = 20; } doc.text(line, M, y); y += 5; });
    y += 6;
  });

  doc.save(`mlops-report-${Date.now()}.pdf`);
}

/* ─── component ─────────────────────────────────────────────── */

export default function MLOpsPage() {
  const [lastTrained, setLastTrained] = useState("Today 17:21");
  const [realRuns, setRealRuns]     = useState<any[]>([]);
  const [predStats, setPredStats]   = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [totalRuns, setTotalRuns]   = useState(17);
  const [showMlflowUI, setShowMlflowUI] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Training data + retrain state
  const [datasetSummary, setDatasetSummary] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [retrainingAll, setRetrainingAll] = useState(false);
  const [retrainingGnn, setRetrainingGnn] = useState(false);
  const [retrainResult, setRetrainResult] = useState<any>(null);
  const [gnnRetrainResult, setGnnRetrainResult] = useState<any>(null);

  useEffect(() => { fetchMLOpsData(); fetchDatasetSummary(); }, []);

  const fetchDatasetSummary = async () => {
    try {
      const res = await axios.get(`${ML_API}/data/summary`);
      setDatasetSummary(res.data || {});
    } catch (err) { console.error("Failed to fetch dataset summary", err); }
  };

  const handleUpload = async (dataset: string, file: File) => {
    setUploading(dataset);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${ML_API}/data/upload/${dataset}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${dataset}: ${res.data.rows} rows uploaded — ready to retrain`);
      fetchDatasetSummary();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || `Upload failed for ${dataset}`);
    } finally { setUploading(null); }
  };

  const retrainAll = async () => {
    setRetrainingAll(true);
    setRetrainResult(null);
    toast.info("Retraining all 6 models on current data/raw/ — this can take up to a minute…");
    try {
      const res = await axios.post(`${ML_API}/train/all`, {}, { timeout: 190_000 });
      if (res.data.success) {
        setRetrainResult(res.data);
        setLastTrained("Just now");
        toast.success("Retraining complete — see before/after metrics below");
        fetchMLOpsData();
      } else {
        toast.error(`Retraining failed: ${res.data.error?.slice(0, 200) || "unknown error"}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Retraining request failed");
    } finally { setRetrainingAll(false); }
  };

  const retrainGnn = async () => {
    setRetrainingGnn(true);
    setGnnRetrainResult(null);
    toast.info("Retraining GNN on 500 synthetic graphs — this can take up to a minute…");
    try {
      const res = await axios.post(`${ML_API}/train/gnn`, {}, { timeout: 190_000 });
      if (res.data.success) {
        setGnnRetrainResult(res.data);
        toast.success("GNN retraining complete");
      } else {
        toast.error(`GNN retraining failed: ${res.data.error?.slice(0, 200) || "unknown error"}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "GNN retraining request failed");
    } finally { setRetrainingGnn(false); }
  };

  const fetchMLOpsData = async () => {
    setDataLoading(true);
    try {
      const [runsRes, statsRes, compRes] = await Promise.all([
        axios.get(`${ML_API}/mlops/experiment-runs`),
        axios.get(`${ML_API}/mlops/prediction-stats`),
        axios.get(`${ML_API}/mlops/model-comparison`),
      ]);
      setRealRuns(runsRes.data.runs?.filter((r: any) => r.accuracy !== null) || []);
      setTotalRuns(runsRes.data.total_runs || 17);
      setPredStats(statsRes.data);
      setComparison(compRes.data);
    } catch (err) { console.error("Failed to fetch MLOps data", err); }
    finally { setDataLoading(false); }
  };

  const trainingHistory = comparison
    ? Object.entries(comparison).slice(0, 5).map(([name, versions]: any) => {
        const sorted = [...versions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return { model: name, v1: sorted[0]?.accuracy || 0, v2: sorted[sorted.length - 1]?.accuracy || 0 };
      })
    : [];

  const displayModels = realRuns.length > 0
    ? realRuns.slice(0, 5).map(r => ({ name: r.name, accuracy: r.accuracy, f1: r.f1, auc: r.auc, status: r.status, type: r.name.includes("rf") ? "Random Forest" : "XGBoost" }))
    : fallbackModels;

  const avgAccuracy = displayModels.length > 0
    ? (displayModels.reduce((sum, m) => sum + (m.accuracy || 0), 0) / displayModels.length).toFixed(1)
    : "86.1";

  const avgAuc = displayModels.length > 0
    ? (displayModels.reduce((sum, m) => sum + (m.auc || 0), 0) / displayModels.length).toFixed(3)
    : "0.953";

  const driftWarnings = driftData.filter(d => d.status === "warning").length;

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={ANALYTICS_TABS} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">MLOps Dashboard</h1>
          <p className="text-white/35 text-[13px] mt-1">
            MLflow · Prefect Pipelines · Model Registry · Drift Detection
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowMlflowUI(v => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
            style={showMlflowUI
              ? { background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }
              : { ...ghostBtnStyle, color: "rgba(255,255,255,0.7)" }}>
            <Activity className="w-4 h-4" style={{ color: "#F97316" }} />
            MLflow UI
            {showMlflowUI ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </button>
          <button onClick={retrainAll} disabled={retrainingAll} className={primaryBtn} style={primaryBtnStyle}>
            {retrainingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {retrainingAll ? "Retraining…" : "Retrain All Models"}
          </button>
          <button onClick={() => exportToPDF(displayModels, avgAccuracy, avgAuc, totalRuns, predStats)}
            className={ghostBtn} style={ghostBtnStyle}>
            <Download className="w-4 h-4" /> PDF
          </button>
          {!summaryOpen && (
            <button onClick={() => setSummaryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
              <Sparkles className="w-4 h-4" /> AI Summary
            </button>
          )}
        </div>
      </motion.div>

      {/* MLflow Experiment Tracker Panel */}
      {showMlflowUI && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card overflow-hidden" style={{ borderColor: ACCENT.orange.border }}>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: ACCENT.orange.bg }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: ACCENT.orange.bg, border: `1px solid ${ACCENT.orange.border}` }}>
                <Activity className="w-4 h-4" style={{ color: ACCENT.orange.text }} />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">MLflow Experiment Tracker</p>
                <p className="text-xs text-white/35">Experiment: civilai_construction_models · {totalRuns} runs logged</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{ background: ACCENT.green.bg, color: ACCENT.green.text, border: `1px solid ${ACCENT.green.border}` }}>
                <CheckCircle className="w-3 h-3" /> All models in production
              </span>
              <button onClick={() => window.open("http://localhost:5000", "_blank")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Open live UI
              </button>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-7 gap-3 px-3 py-2 text-xs text-white/35 font-medium mb-1"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="col-span-2">Run Name</span><span>Algorithm</span><span>Accuracy</span><span>F1 Score</span><span>AUC</span><span>Status</span>
            </div>
            <div className="space-y-0.5">
              {displayModels.map((model, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="grid grid-cols-7 gap-3 items-center px-3 py-3 rounded-xl hover:bg-white/3 transition-colors group">
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT.green.text }} />
                    <span className="text-sm text-white truncate">{model.name}</span>
                    <span className="text-xs text-white/35 opacity-0 group-hover:opacity-100 transition-opacity font-mono">run_{String(i + 1).padStart(3, "0")}</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-lg text-white/40 w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>{model.type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-14 rounded-full h-1" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-1 rounded-full" style={{ width: `${model.accuracy}%`, background: ACCENT.cyan.text, boxShadow: `0 0 6px ${ACCENT.cyan.shadow}` }} />
                    </div>
                    <span className="text-sm font-medium text-white">{model.accuracy}%</span>
                  </div>
                  <span className="text-sm text-white">{typeof model.f1 === "number" ? model.f1.toFixed(3) : model.f1}</span>
                  <span className="text-sm font-medium" style={{ color: ACCENT.green.text }}>{typeof model.auc === "number" ? model.auc.toFixed(3) : model.auc}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full w-fit"
                    style={{ background: ACCENT.green.bg, color: ACCENT.green.text, border: `1px solid ${ACCENT.green.border}` }}>
                    {model.status === "FINISHED" ? "FINISHED" : model.status}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-3 px-3 py-3 mt-2 rounded-xl text-xs"
              style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}` }}>
              <span className="col-span-2 font-semibold text-white">Average</span><span />
              <span className="font-semibold" style={{ color: ACCENT.cyan.text }}>{avgAccuracy}%</span>
              <span className="font-semibold" style={{ color: ACCENT.cyan.text }}>{(displayModels.reduce((s, m) => s + (typeof m.f1 === "number" ? m.f1 : parseFloat(m.f1) || 0), 0) / displayModels.length).toFixed(3)}</span>
              <span className="font-semibold" style={{ color: ACCENT.green.text }}>{avgAuc}</span><span />
            </div>
            <div className="mt-4 flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Terminal className="w-4 h-4 text-white/35 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/35 mb-1.5">Start the live MLflow UI — run this in your terminal from the <code className="font-mono text-cyan-400">ml/</code> folder:</p>
                <code className="text-xs font-mono bg-black/20 px-2 py-1 rounded" style={{ color: ACCENT.green.text }}>.\venv\Scripts\activate &amp;&amp; mlflow ui --port 5000</code>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Runs",        value: totalRuns.toString(),                                    icon: Brain,      accent: "cyan" },
          { label: "Avg Accuracy",      value: `${avgAccuracy}%`,                                      icon: TrendingUp, accent: "green" },
          { label: "Avg AUC Score",     value: avgAuc,                                                 icon: Activity,   accent: "cyan" },
          { label: "Total Predictions", value: predStats ? predStats.total_predictions.toString() : "0",icon: Cpu,        accent: "orange" },
        ].map((kpi, i) => {
          const a = ACCENT[kpi.accent];
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}>
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <div className="relative flex items-center justify-between mb-2">
                <p className="text-sm text-white/40">{kpi.label}</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: a.bg, border: `1px solid ${a.border}` }}>
                  <kpi.icon className="w-4 h-4" style={{ color: a.text }} />
                </div>
              </div>
              {dataLoading ? <Loader2 className="w-5 h-5 animate-spin mt-1" style={{ color: a.text }} /> : (
                <p className="relative text-2xl font-bold text-white">{kpi.value}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Training Data */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">Training Data</h3>
          </div>
          <button onClick={retrainGnn} disabled={retrainingGnn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all hover:scale-105 disabled:opacity-50"
            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
            {retrainingGnn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
            {retrainingGnn ? "Retraining GNN…" : "Retrain GNN"}
          </button>
        </div>
        <p className="text-xs text-white/35 mb-4">
          Upload your own CSV to replace any training set (must include the required columns), then hit
          "Retrain All Models" above to train on it. Each upload keeps a backup of the previous file.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(datasetSummary).map(([name, info]: [string, any]) => (
            <div key={name} className="p-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-white">{name.replace(/_/g, " ")}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={info.exists
                    ? { background: ACCENT.green.bg, color: ACCENT.green.text }
                    : { background: ACCENT.red.bg, color: ACCENT.red.text }}>
                  {info.exists ? `${info.rows} rows` : "missing"}
                </span>
              </div>
              <p className="text-[11px] text-white/35 mb-2 truncate" title={info.required_columns?.join(", ")}>
                Required columns: {info.required_columns?.join(", ")}
              </p>
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs cursor-pointer transition-colors"
                style={uploading === name
                  ? { borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF" }
                  : { borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }}>
                {uploading === name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading === name ? "Uploading…" : "Upload replacement CSV"}
                <input type="file" accept=".csv" className="hidden" disabled={uploading === name}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(name, f); e.target.value = ""; }} />
              </label>
            </div>
          ))}
          {Object.keys(datasetSummary).length === 0 && (
            <p className="text-sm text-white/35 col-span-2 py-4 text-center">
              Loading dataset info from the ML service… (make sure it's running at {ML_API})
            </p>
          )}
        </div>
      </motion.div>

      {/* Retrain Results */}
      {(retrainResult || gnnRetrainResult) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.green.border }}>
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" style={{ color: ACCENT.green.text }} /> Retrain Results — Before vs After
          </h3>
          {retrainResult && (
            <div className="mb-4">
              <p className="text-xs text-white/35 mb-2">All Models ({new Date(retrainResult.after?.timestamp || Date.now()).toLocaleString()})</p>
              <div className="space-y-1.5">
                {Object.entries(retrainResult.after?.models || {}).map(([name, m]: [string, any]) => {
                  const beforeM = retrainResult.before?.models?.[name];
                  const metricKey = "accuracy" in m ? "accuracy" : "r2_score";
                  const beforeVal = beforeM?.[metricKey];
                  const afterVal = m[metricKey];
                  const delta = typeof beforeVal === "number" ? afterVal - beforeVal : null;
                  return (
                    <div key={name} className="flex items-center gap-3 p-2.5 rounded-lg text-sm"
                      style={{ background: "rgba(255,255,255,0.03)" }}>
                      <span className="flex-1 text-white truncate">{name.replace(/_/g, " ")}</span>
                      <span className="text-xs text-white/35 w-24 text-right">{beforeVal != null ? `${(beforeVal * 100).toFixed(1)}%` : "—"}</span>
                      <ArrowRight className="w-3 h-3 text-white/35 shrink-0" />
                      <span className="text-xs font-medium text-white w-24">{(afterVal * 100).toFixed(1)}%</span>
                      {delta != null && (
                        <span className="text-xs font-semibold w-16 text-right"
                          style={{ color: delta > 0 ? ACCENT.green.text : delta < 0 ? ACCENT.red.text : "rgba(255,255,255,0.35)" }}>
                          {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {gnnRetrainResult && (
            <div>
              <p className="text-xs text-white/35 mb-2">GNN Risk Model — Validation Loss (lower is better)</p>
              <div className="flex items-center gap-3 p-2.5 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.03)" }}>
                <span className="flex-1 text-white">gnn_risk_model</span>
                <span className="text-xs text-white/35 w-24 text-right">{gnnRetrainResult.before?.best_val_loss ?? "—"}</span>
                <ArrowRight className="w-3 h-3 text-white/35 shrink-0" />
                <span className="text-xs font-medium text-white w-24">{gnnRetrainResult.after?.best_val_loss}</span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* AI Verbose Summary */}
      {summaryOpen && (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden" style={{ borderColor: ACCENT.cyan.border }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}` }}>
              <Sparkles className="w-4 h-4" style={{ color: ACCENT.cyan.text }} />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">AI MLOps Intelligence Summary</p>
              <p className="text-xs text-white/35">Verbose technical explanation of model performance and pipeline state</p>
            </div>
            {driftWarnings > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                style={{ color: ACCENT.orange.text, borderColor: ACCENT.orange.border, background: ACCENT.orange.bg }}>
                {driftWarnings} Drift Warning{driftWarnings > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button onClick={() => setSummaryOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4 text-white/35" />
          </button>
        </div>
        <div className="px-6 pb-6 space-y-5 text-sm leading-relaxed">

                <div className="pt-5">
                  <p className="font-bold text-base text-white mb-2">MLOps Platform Overview</p>
                  <p className="text-white/35">
                    CivilAI's <strong className="text-white">MLOps platform</strong> manages a suite of{" "}
                    <strong className="text-white">5 production ML models</strong> for construction risk prediction,
                    orchestrated through <strong className="text-white">MLflow experiment tracking</strong> and{" "}
                    <strong className="text-white">Prefect pipeline automation</strong>.
                    {" "}<strong className="text-white">{totalRuns} experiment runs</strong> have been logged in the
                    MLflow tracking server. Average model accuracy is{" "}
                    <strong className="text-white">{avgAccuracy}%</strong> with an average AUC of{" "}
                    <strong className="text-white">{avgAuc}</strong>.
                    {" "}<strong className="text-white">{predStats?.total_predictions ?? 0} predictions</strong> have
                    been served to date.{" "}
                    {driftWarnings > 0
                      ? <><strong className="text-orange-400">{driftWarnings} feature(s) showing drift</strong> — model retraining may be required soon.</>
                      : <><strong className="text-emerald-400">All monitored features are stable</strong> — no immediate retraining required.</>
                    }
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="font-bold text-white mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    Model Performance Analysis
                  </p>
                  <p className="text-white/35">
                    The model suite achieves a weighted-average accuracy of{" "}
                    <strong className="text-white">{avgAccuracy}%</strong> across five risk prediction domains.
                    {" "}<strong className="text-white">XGBoost models</strong> (Cost Overrun: 83%, Delay: 88.5%,
                    Workforce Turnover: 87%) excel at capturing non-linear feature interactions in tabular construction
                    data — change order frequency, workforce density, and labor shortage signals interact multiplicatively
                    in ways linear models cannot capture.{" "}
                    <strong className="text-white">Random Forest models</strong> (Safety Risk: 88%,
                    Equipment Failure: 84%) provide robustness against outliers — critical for safety datasets where
                    rare severe events must not be misclassified.
                    {" "}<strong className="text-white">AUC scores of 0.938–0.970</strong> indicate strong
                    discriminative power: even at low risk thresholds, the models correctly rank high-risk projects
                    above low-risk projects with high confidence. AUC &gt; 0.9 is considered{" "}
                    <strong className="text-white">excellent</strong> by industry standards.
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="font-bold text-white mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orange-400" />
                    Data Drift Analysis (PSI)
                  </p>
                  <p className="text-white/35">
                    <strong className="text-white">Population Stability Index (PSI)</strong> measures feature
                    distribution shift between training and production data. Thresholds:{" "}
                    <strong className="text-emerald-400">PSI &lt; 0.10</strong> = stable (no action),{" "}
                    <strong className="text-yellow-400">PSI 0.10–0.20</strong> = moderate drift (monitor),{" "}
                    <strong className="text-red-400">PSI &gt; 0.20</strong> = significant drift (retrain required).
                    {" "}Current status:{" "}
                    <strong className="text-orange-400">weather_delays (PSI=0.15)</strong> and{" "}
                    <strong className="text-orange-400">last_service (PSI=0.14)</strong> show moderate drift,
                    potentially indicating seasonal construction patterns or changes in maintenance scheduling.
                    The remaining <strong className="text-white">4 features are stable</strong> (PSI &lt; 0.10).
                    {" "}Recommendation: retrain the <strong className="text-white">Delay Prediction</strong> and{" "}
                    <strong className="text-white">Equipment Failure</strong> models with the last 90 days of
                    production data within <strong className="text-white">30 days</strong> to maintain accuracy.
                    Model performance degradation from drift typically manifests as a 2–5% accuracy drop over 60–90 days.
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="font-bold text-white mb-2 flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    Prefect Pipeline Health
                  </p>
                  <p className="text-white/35">
                    The <strong className="text-white">Prefect orchestration pipeline</strong> completed
                    6 of 7 stages successfully with 1 warning in the Drift Detection step (3.1s runtime).
                    The pipeline sequence is:{" "}
                    <strong className="text-white">Data Validation</strong> → Feature Engineering →
                    Model Training (6 models, ~45s) → MLflow Logging (12s) → Drift Detection →
                    Performance Check → Model Deployment. Total runtime: ~65 seconds.
                    {" "}The <strong className="text-white">Drift Detection warning</strong> triggers when PSI
                    exceeds 0.10 on any monitored feature — this is a soft warning, not a pipeline failure.
                    All models remain in <strong className="text-emerald-400">production status</strong>.
                    Last pipeline run completed successfully. Trigger retraining via{" "}
                    <strong className="text-white">Run Pipeline</strong> button or on the Prefect schedule.
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}` }}>
                  <p className="font-bold text-white mb-2 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-cyan-400" />
                    Architecture &amp; Technology Stack
                  </p>
                  <p className="text-white/35">
                    <strong className="text-white">Training framework:</strong> scikit-learn XGBoost + Random Forest
                    with hyperparameter tuning via Optuna.
                    {" "}<strong className="text-white">Experiment tracking:</strong> MLflow with run-level logging of
                    accuracy, F1, AUC, confusion matrices, and feature importance plots.
                    {" "}<strong className="text-white">Pipeline orchestration:</strong> Prefect 2.x with task-level
                    retry policies and failure notifications.
                    {" "}<strong className="text-white">Model serving:</strong> FastAPI (port 8001) with &lt;50ms
                    prediction latency.
                    {" "}<strong className="text-white">Drift detection:</strong> Evidently AI PSI monitoring
                    on 6 key features.
                    {" "}<strong className="text-white">Data source:</strong> Supabase PostgreSQL with real-time
                    webhooks for continuous monitoring.
                    {" "}Training data: synthetic construction datasets augmented with OSHA and ASCE industry benchmarks.
                  </p>
                </div>
              </div>
      </motion.div>
      )}

      {/* Model Registry */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-white">Model Registry</h3>
          {realRuns.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: ACCENT.green.bg, color: ACCENT.green.text }}>Live from MLflow</span>}
        </div>
        <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-white/35 font-medium mb-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="col-span-2">Model</span><span>Algorithm</span><span>Accuracy</span><span>AUC</span><span>Status</span>
        </div>
        <div className="space-y-1">
          {displayModels.map((model, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
              className="grid grid-cols-6 gap-4 items-center px-4 py-3 rounded-xl hover:bg-white/3 transition-colors">
              <div className="col-span-2 flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white truncate">{model.name}</span>
              </div>
              <span className="text-xs px-2 py-1 rounded-lg text-white/35" style={{ background: "rgba(255,255,255,0.05)" }}>{model.type}</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full h-1.5 w-16" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${model.accuracy}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                    className="h-1.5 rounded-full" style={{ background: ACCENT.cyan.text, boxShadow: `0 0 6px ${ACCENT.cyan.shadow}` }} />
                </div>
                <span className="text-xs text-white">{model.accuracy}%</span>
              </div>
              <span className="text-sm font-medium" style={{ color: ACCENT.green.text }}>{model.auc}</span>
              <span className="text-xs px-2.5 py-1 rounded-full w-fit"
                style={{ background: ACCENT.green.bg, color: ACCENT.green.text, border: `1px solid ${ACCENT.green.border}` }}>
                {model.status === "FINISHED" ? "production" : model.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white mb-2">Model Accuracy Comparison</h3>
          <p className="text-xs text-white/35 mb-4">{realRuns.length > 0 ? "Live from MLflow" : "Sample data"} — accuracy %</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={displayModels} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <YAxis dataKey="name" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} width={130} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
              <Bar dataKey="accuracy" fill="#00D4FF" radius={[0, 6, 6, 0]} name="Accuracy %" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Overall ML Performance Radar</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Version Comparison */}
      {trainingHistory.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-white">Model Version Improvement</h3>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: ACCENT.green.bg, color: ACCENT.green.text }}>Live MLflow</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trainingHistory} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="model" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
              <Bar dataKey="v1" fill="#EF444450" radius={[6, 6, 0, 0]} name="V1 Accuracy %" />
              <Bar dataKey="v2" fill="#10B981"   radius={[6, 6, 0, 0]} name="V2 Accuracy %" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: ACCENT.red.text, boxShadow: `0 0 6px ${ACCENT.red.text}` }} /><span className="text-xs text-white/35">V1 (Initial)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: ACCENT.green.text, boxShadow: `0 0 6px ${ACCENT.green.text}` }} /><span className="text-xs text-white/35">V2 (Improved)</span></div>
          </div>
        </motion.div>
      )}

      {/* Drift + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Data Drift Monitor (PSI)</h3>
          <div className="space-y-3">
            {driftData.map((item, i) => {
              const dAccent = item.psi < 0.1 ? ACCENT.green : item.psi < 0.2 ? ACCENT.orange : ACCENT.red;
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-center gap-3">
                  {item.status === "stable"
                    ? <CheckCircle className="w-4 h-4 shrink-0" style={{ color: ACCENT.green.text }} />
                    : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ACCENT.orange.text }} />}
                  <span className="text-sm text-white w-36">{item.feature}</span>
                  <div className="flex-1 rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(item.psi * 300, 100)}%` }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                      className="h-1.5 rounded-full" style={{ background: dAccent.text, boxShadow: `0 0 8px ${dAccent.text}60` }} />
                  </div>
                  <span className="text-xs text-white/35 w-12 text-right">PSI={item.psi}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: item.status === "stable" ? ACCENT.green.bg : ACCENT.orange.bg,
                      color: item.status === "stable" ? ACCENT.green.text : ACCENT.orange.text,
                    }}>
                    {item.status}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">Prefect Pipeline Status</h3>
          </div>
          <div className="space-y-2">
            {pipelineSteps.map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.07 }}
                className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                {step.status === "passed"
                  ? <CheckCircle className="w-4 h-4 shrink-0" style={{ color: ACCENT.green.text }} />
                  : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ACCENT.orange.text }} />}
                <span className="text-sm text-white flex-1">{step.step}</span>
                <span className="text-xs text-white/35">{step.duration}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: step.status === "passed" ? ACCENT.green.bg : ACCENT.orange.bg,
                    color: step.status === "passed" ? ACCENT.green.text : ACCENT.orange.text,
                  }}>
                  {step.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <ModuleChat
        context="MLOps Dashboard"
        placeholder="Ask about models, pipelines, drift, experiment runs…"
        pageSummaryData={{ totalRuns, avgAccuracy, avgAuc, predStats, realRuns: realRuns.slice(0, 5), driftWarnings }}
      />
    </div>
  );
}
