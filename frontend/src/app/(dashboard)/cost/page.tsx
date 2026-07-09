"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Upload,
  Loader2,
  Brain,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import GlassModal from "@/components/shared/GlassModal";
import Sparkline from "@/components/shared/Sparkline";
import MaterialPricesPanel from "@/components/shared/MaterialPricesPanel";
import TimeRangeSelector, { type TimeRange, rangeToParams } from "@/components/shared/TimeRangeSelector";
import { MarkdownText } from "@/lib/renderMarkdown";
import {
  CHART_TOOLTIP_STYLE,
  BURN_CHART_COLORS,
  CASHFLOW_CHART_COLORS,
} from "@/lib/constants";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

const EVMPage       = dynamic(() => import("../evm/page"),      { ssr: false });
const PaymentsPage  = dynamic(() => import("../payments/page"), { ssr: false });
const ScenarioPage  = dynamic(() => import("../scenario/page"), { ssr: false });

const COST_TABS = [
  { id: "overview", label: "Overview" },
  { id: "evm",      label: "EVM" },
  { id: "payments", label: "Payments" },
  { id: "scenario", label: "Scenario Planner" },
];

const PROJECT_TABS = [
  { href: "/cost",        label: "Cost & Budget" },
  { href: "/financials",  label: "Financial Budget" },
  { href: "/procurement", label: "Procurement" },
];


interface CostKpis {
  totalBudget: number;
  spentToDate: number;
  committedAmount: number;
  remaining: number;
  overrunPct: number;
  projectCount: number;
}

interface ExtractedItem {
  _id: number;
  description: string;
  category?: string | null;
  amount: number;
  entry_date?: string | null;
  item_type: "budget" | "actual" | "other";
  approved: boolean;
}

interface RawExtractedItem {
  description: string;
  category?: string | null;
  amount: number;
  entry_date?: string | null;
  item_type?: "budget" | "actual" | "other";
}

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// burnChartData ("budget"/"actual") comes from the API already scaled to $K — a formatter
// expecting raw dollars would show values 1000x too small in sparkline tooltips.
function fmtMoneyK(v: number) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}K`;
}

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

export default function CostPage() {
  const { counters, triggerRefresh } = useDataRefreshStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subTab, setSubTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [mlData, setMlData] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [trainLoading, setTrainLoading] = useState(false);
  const [costKpis, setCostKpis] = useState<CostKpis | null>(null);
  const [burnChartData, setBurnChartData] = useState<any[]>([]);
  const [burnLoading, setBurnLoading] = useState(true);
  const [burnRange, setBurnRange] = useState<TimeRange>({ preset: "6m" });
  const [cashflowChartData, setCashflowChartData] = useState<any[]>([]);
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [cashflowRange, setCashflowRange] = useState<TimeRange>({ preset: "6m" });
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("all");

  // AI cash flow narrative forecast
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastForm, setForecastForm] = useState({ completion_percentage: 0, monthly_burn_rate: 0 });
  const [forecastResult, setForecastResult] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);

  // Upload -> validate -> extract -> review/approve line items
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractDocType, setExtractDocType] = useState("");
  const [extractValidation, setExtractValidation] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [addingEntries, setAddingEntries] = useState(false);

  useEffect(() => {
    fetchRealData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when cost entries change elsewhere (e.g. added/deleted on the EVM page) or when
  // an invoice changes in Payments — committed_amount is derived from pending/overdue invoices
  useEffect(() => {
    fetchRealData();
  }, [counters.cost, counters.payments]); // eslint-disable-line react-hooks/exhaustive-deps

  // ML prediction reacts to the selected project and to new cost entries
  useEffect(() => {
    fetchMlPrediction(selectedProjectId);
  }, [selectedProjectId, counters.cost]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBurnChart(burnRange);
  }, [burnRange, counters.cost]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCashflowChart(cashflowRange);
  }, [cashflowRange, counters.cost]); // eslint-disable-line react-hooks/exhaustive-deps

  const computeKpis = (projects: any[], filterProjectId: string) => {
    const filtered = filterProjectId === "all" ? projects : projects.filter((p) => p.id === filterProjectId);
    const totalBudget = filtered.reduce((s, p) => s + (p.total_budget || 0), 0);
    const spentToDate = filtered.reduce((s, p) => s + (p.spent_to_date || 0), 0);
    const committedAmount = filtered.reduce((s, p) => s + (p.committed_amount || 0), 0);
    const remaining   = totalBudget - spentToDate;
    const overrunPct  = totalBudget > 0 ? Math.max(0, ((spentToDate - totalBudget) / totalBudget) * 100) : 0;
    setCostKpis({ totalBudget, spentToDate, committedAmount, remaining, overrunPct, projectCount: filtered.length });
    return { totalBudget, spentToDate, filtered };
  };

  // Recompute KPIs when filter changes without re-fetching everything
  useEffect(() => {
    if (allProjects.length > 0) computeKpis(allProjects, selectedProjectId);
  }, [selectedProjectId, allProjects]);

  // Pre-fill the burn rate field from the actual burn chart once it loads
  useEffect(() => {
    if (burnChartData.length === 0) return;
    const avgActual = burnChartData.reduce((s, d) => s + (d.actual || 0), 0) / burnChartData.length;
    setForecastForm((p) => ({ ...p, monthly_burn_rate: Math.round(avgActual * 1000) }));
  }, [burnChartData]);

  const fetchRealData = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const projects: any[] = res.data.projects || [];
      setAllProjects(projects);
      computeKpis(projects, selectedProjectId);
    } catch (err) {
      console.error("Failed to fetch projects", err);
    }
  };

  // Same real-data-driven prediction the Predictive Analytics and Analytics pages use —
  // derives duration/team/change-orders/material-price/weather/subcontractor inputs
  // server-side from this project (or all projects) instead of guessing client-side.
  const fetchMlPrediction = async (projectId: string) => {
    setMlLoading(true);
    try {
      const url = projectId !== "all"
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/cost-overrun-auto?project_id=${projectId}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/cost-overrun-auto`;
      const res = await axios.get(url);
      setMlData(res.data);
    } catch (err) {
      console.error("Failed to fetch cost-overrun prediction", err);
      setMlData(null);
    } finally {
      setMlLoading(false);
    }
  };

  const trainMlModel = async () => {
    setTrainLoading(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/cost-overrun/train`);
      const { accuracy, real_project_rows, total_rows } = res.data;
      toast.success(
        `Model retrained on ${total_rows.toLocaleString()} rows (${real_project_rows} from your projects) — ${(accuracy * 100).toFixed(1)}% accuracy`
      );
      fetchMlPrediction(selectedProjectId);
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to retrain model");
    } finally {
      setTrainLoading(false);
    }
  };

  const fetchBurnChart = async (range: TimeRange) => {
    setBurnLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/costs`, {
        params: rangeToParams(range),
      });
      setBurnChartData(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch burn chart", err);
    } finally {
      setBurnLoading(false);
    }
  };

  const fetchCashflowChart = async (range: TimeRange) => {
    setCashflowLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/cashflow`, {
        params: rangeToParams(range),
      });
      setCashflowChartData(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch cashflow chart", err);
    } finally {
      setCashflowLoading(false);
    }
  };

  const runCashflowForecast = async () => {
    const project = selectedProjectId !== "all" ? allProjects.find((p) => p.id === selectedProjectId) : null;
    if (!project) { toast.error("Select a specific project first"); return; }
    setForecastLoading(true);
    setForecastResult("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/cost/cashflow-forecast`,
        {
          project_name: project.name,
          total_budget: project.total_budget || 0,
          spent_to_date: project.spent_to_date || 0,
          completion_percentage: forecastForm.completion_percentage,
          monthly_burn_rate: forecastForm.monthly_burn_rate,
          pending_payments: [],
        }
      );
      setForecastResult(response.data.forecast);
      toast.success("Cash flow forecast ready");
    } catch {
      toast.error("Failed to generate forecast");
    } finally {
      setForecastLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/cost/analyze-report`,
        formData
      );
      const data = response.data;
      if (!data.is_cost_document) {
        toast.error(data.validation_message || "That doesn't look like a cost report — please try again with a different file.");
        return;
      }
      setAnalysis(data.analysis || "");
      const items: ExtractedItem[] = ((data.items || []) as RawExtractedItem[]).map((it, i) => ({
        _id: i,
        description: it.description,
        category: it.category,
        amount: it.amount,
        entry_date: it.entry_date,
        item_type: it.item_type || "actual",
        approved: true,
      }));
      setExtractedItems(items);
      setExtractDocType(data.document_type || "Cost Document");
      setExtractValidation(data.validation_message || "");
      setConfirmStep(false);
      setExtractOpen(true);
      toast.success(items.length > 0
        ? `Validated — found ${items.length} line item${items.length !== 1 ? "s" : ""} to review`
        : "Validated as a cost document");
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to analyze report");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const toggleExtractedItem = (id: number) =>
    setExtractedItems((items) => items.map((i) => (i._id === id ? { ...i, approved: !i.approved } : i)));

  const toggleAllExtractedItems = (val: boolean) =>
    setExtractedItems((items) => items.map((i) => ({ ...i, approved: val })));

  const approvedItems = extractedItems.filter((i) => i.approved);
  const approvedTotal = approvedItems.reduce((s, i) => s + (i.amount || 0), 0);

  const confirmAddEntries = async () => {
    if (selectedProjectId === "all") { toast.error("Select a specific project first"); return; }
    if (approvedItems.length === 0) { toast.error("Select at least one item to add"); return; }
    setAddingEntries(true);
    try {
      await Promise.all(approvedItems.map((it) =>
        axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${selectedProjectId}/cost`, {
          amount: it.amount,
          description: it.description,
          category: it.category || undefined,
          entry_date: it.entry_date || undefined,
        })
      ));
      toast.success(`Added ${approvedItems.length} cost ${approvedItems.length === 1 ? "entry" : "entries"}`);
      triggerRefresh("cost");
      setExtractOpen(false);
      setExtractedItems([]);
      setConfirmStep(false);
      fetchRealData();
    } catch {
      toast.error("Failed to add some entries — please try again");
    } finally {
      setAddingEntries(false);
    }
  };

  const tabBar = (
    <div className="flex gap-0.5 p-1 rounded-xl w-fit"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {COST_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors"
          style={subTab === t.id
            ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
            : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}>
          {t.label}
        </button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={PROJECT_TABS} />
      {tabBar}
      {subTab === "evm"      && <div className="pt-6"><EVMPage      projectId={selectedProjectId !== "all" ? selectedProjectId : undefined} /></div>}
      {subTab === "payments" && <div className="pt-6"><PaymentsPage projectId={selectedProjectId !== "all" ? selectedProjectId : undefined} /></div>}
      {subTab === "scenario" && <div className="pt-6"><ScenarioPage projectId={selectedProjectId !== "all" ? selectedProjectId : undefined} /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={PROJECT_TABS} />
      {tabBar}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Cost & Budget</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered cost intelligence &amp; forecasting
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allProjects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={glassInputClass + " w-auto"}
              style={glassInputStyle}
            >
              <option value="all">All Projects</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setForecastOpen(!forecastOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 whitespace-nowrap transition-all hover:scale-105"
            style={glassButtonStyle}>
            <Sparkles className="w-4 h-4 text-cyan-400" />
            AI Forecast
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx" onChange={handleFileUpload} />
          <div className="relative group">
            <button onClick={() => fileInputRef.current?.click()} disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-60"
              style={gradientButtonStyle}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload
            </button>
            <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-xl text-[11px] text-white/60 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20"
              style={{ background: "rgba(4,11,25,0.95)", border: "1px solid rgba(0,212,255,0.15)", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
              <p className="text-white/80 font-medium mb-1">Upload a cost report</p>
              Accepts PDF, Excel (.xlsx/.xls) or Word (.docx). AI validates it&apos;s a real cost/budget document, extracts line items, and lets you approve which ones to add.
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI Cash Flow Narrative Forecast */}
      {forecastOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: "rgba(0,212,255,0.25)" }}>
          <h3 className="font-semibold text-white text-[15px] mb-1">AI Cash Flow Forecast</h3>
          <p className="text-[11px] text-white/35 mb-4">
            {selectedProjectId === "all"
              ? "Select a specific project above to generate a narrative cash flow forecast"
              : `Forecasting for ${allProjects.find((p) => p.id === selectedProjectId)?.name ?? "the selected project"}`}
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Completion (%)</label>
              <input type="number" min={0} max={100} value={forecastForm.completion_percentage || ""}
                onChange={(e) => setForecastForm(p => ({ ...p, completion_percentage: parseFloat(e.target.value) || 0 }))}
                className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Monthly Burn Rate ($)</label>
              <input type="number" value={forecastForm.monthly_burn_rate || ""}
                onChange={(e) => setForecastForm(p => ({ ...p, monthly_burn_rate: parseFloat(e.target.value) || 0 }))}
                className={glassInputClass} style={glassInputStyle} />
            </div>
          </div>
          <button onClick={runCashflowForecast} disabled={forecastLoading || selectedProjectId === "all"}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}>
            {forecastLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Forecast
          </button>
          {forecastResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <MarkdownText text={forecastResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Upload -> validate -> review extracted line items */}
      <GlassModal
        open={extractOpen}
        onClose={() => { setExtractOpen(false); setConfirmStep(false); }}
        title={confirmStep ? "Confirm changes" : `Review extracted items — ${extractDocType}`}
        subtitle={confirmStep ? undefined : extractValidation}
        maxWidth="max-w-2xl"
      >
        {!confirmStep ? (
          <>
            {extractedItems.length === 0 ? (
              <p className="text-sm text-white/50">
                This looks like a valid cost document, but no distinct line items could be extracted.
                {analysis ? " See the AI Analysis card below for a narrative summary." : ""}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] text-white/35">{approvedItems.length} of {extractedItems.length} selected</p>
                  <div className="flex gap-3">
                    <button onClick={() => toggleAllExtractedItems(true)} className="text-[11px] text-cyan-400 hover:underline">Select all</button>
                    <button onClick={() => toggleAllExtractedItems(false)} className="text-[11px] text-white/40 hover:underline">Select none</button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                  {extractedItems.map((item) => (
                    <label key={item._id}
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                      style={{
                        background: item.approved ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
                        border: item.approved ? "1px solid rgba(0,212,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                      }}>
                      <input type="checkbox" checked={item.approved} onChange={() => toggleExtractedItem(item._id)}
                        className="mt-1 w-4 h-4 accent-cyan-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] text-white/85 truncate">{item.description}</p>
                          <p className="text-[13px] font-semibold text-white shrink-0">{fmtMoney(item.amount)}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {item.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/50"
                              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                              {item.category}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{
                            background: item.item_type === "budget" ? ACCENT.cyan.bg : item.item_type === "actual" ? ACCENT.amber.bg : "rgba(255,255,255,0.05)",
                            border: `1px solid ${item.item_type === "budget" ? ACCENT.cyan.border : item.item_type === "actual" ? ACCENT.amber.border : "rgba(255,255,255,0.08)"}`,
                            color: item.item_type === "budget" ? ACCENT.cyan.text : item.item_type === "actual" ? ACCENT.amber.text : "rgba(255,255,255,0.5)",
                          }}>
                            {item.item_type}
                          </span>
                          {item.entry_date && <span className="text-[10px] text-white/30">{item.entry_date}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => { setExtractOpen(false); toast("Discarded — nothing was added"); }}
                className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors">
                Discard all
              </button>
              {extractedItems.length > 0 && (
                <button onClick={() => setConfirmStep(true)}
                  disabled={approvedItems.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                  style={gradientButtonStyle}>
                  Continue with {approvedItems.length} item{approvedItems.length !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-white/70 leading-relaxed">
              You&apos;re about to add <span className="text-white font-semibold">{approvedItems.length}</span> cost{" "}
              {approvedItems.length === 1 ? "entry" : "entries"} totaling{" "}
              <span className="text-white font-semibold">{fmtMoney(approvedTotal)}</span> to{" "}
              <span className="text-cyan-400 font-medium">
                {selectedProjectId === "all" ? "—" : allProjects.find((p) => p.id === selectedProjectId)?.name ?? "the selected project"}
              </span>. This updates the project&apos;s spend and budget charts immediately.
            </p>
            {selectedProjectId === "all" && (
              <p className="text-[12px] text-amber-400 mt-3">Select a specific project from the dropdown above before confirming.</p>
            )}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setConfirmStep(false)} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors">
                Back
              </button>
              <button onClick={confirmAddEntries} disabled={addingEntries || selectedProjectId === "all"}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                style={gradientButtonStyle}>
                {addingEntries ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm & Update
              </button>
            </div>
          </>
        )}
      </GlassModal>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(costKpis ? [
          {
            label: "Total Budget",
            value: fmtMoney(costKpis.totalBudget),
            trend: "up" as const,
            change: `${costKpis.projectCount} project${costKpis.projectCount !== 1 ? "s" : ""}`,
            accent: "cyan" as const, icon: DollarSign,
            trendData: burnChartData.map((d) => d.budget), trendType: "area" as const,
            trendLabels: burnChartData.map((d) => d.month), trendFmt: fmtMoneyK,
          },
          {
            label: "Spent to Date",
            value: fmtMoney(costKpis.spentToDate),
            trend: "up" as const,
            change: costKpis.totalBudget > 0
              ? `${((costKpis.spentToDate / costKpis.totalBudget) * 100).toFixed(1)}% of budget`
              : "—",
            accent: "amber" as const, icon: TrendingUp,
            trendData: burnChartData.map((d) => d.actual), trendType: "area" as const,
            trendLabels: burnChartData.map((d) => d.month), trendFmt: fmtMoneyK,
          },
          {
            label: "Committed",
            value: fmtMoney(costKpis.committedAmount),
            trend: "up" as const,
            change: "Pending / overdue invoices",
            accent: "blue" as const, icon: DollarSign,
            trendData: [] as number[], trendType: "bar" as const,
            trendLabels: [] as string[], trendFmt: fmtMoneyK,
          },
          {
            label: "Remaining",
            value: fmtMoney(Math.abs(costKpis.remaining)),
            trend: (costKpis.remaining >= 0 ? "up" : "down") as "up" | "down",
            change: costKpis.totalBudget > 0
              ? `${((Math.abs(costKpis.remaining) / costKpis.totalBudget) * 100).toFixed(1)}% ${costKpis.remaining >= 0 ? "left" : "over"}`
              : "—",
            accent: "red" as const, icon: DollarSign,
            trendData: burnChartData.map((d) => d.budget - d.actual), trendType: "bar" as const,
            trendLabels: burnChartData.map((d) => d.month), trendFmt: fmtMoneyK,
          },
          {
            label: "Cost Overrun",
            value: `${costKpis.overrunPct.toFixed(1)}%`,
            trend: (costKpis.overrunPct > 0 ? "down" : "up") as "up" | "down",
            change: costKpis.overrunPct > 0 ? "Over budget" : "On budget",
            accent: "green" as const, icon: TrendingDown,
            trendData: burnChartData.map((d) => d.budget > 0 ? Math.max(0, ((d.actual - d.budget) / d.budget) * 100) : 0), trendType: "line" as const,
            trendLabels: burnChartData.map((d) => d.month), trendFmt: fmtPct,
          },
        ] : [
          { label: "Total Budget", value: "—", trend: "up" as const, change: "Loading…", accent: "cyan" as const, icon: DollarSign, trendData: [] as number[], trendType: "area" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
          { label: "Spent to Date", value: "—", trend: "up" as const, change: "Loading…", accent: "amber" as const, icon: TrendingUp, trendData: [] as number[], trendType: "area" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
          { label: "Committed", value: "—", trend: "up" as const, change: "Loading…", accent: "blue" as const, icon: DollarSign, trendData: [] as number[], trendType: "bar" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
          { label: "Remaining", value: "—", trend: "up" as const, change: "Loading…", accent: "red" as const, icon: DollarSign, trendData: [] as number[], trendType: "bar" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
          { label: "Cost Overrun", value: "—", trend: "up" as const, change: "Loading…", accent: "green" as const, icon: TrendingDown, trendData: [] as number[], trendType: "line" as const, trendLabels: [] as string[], trendFmt: fmtPct },
        ]).map((kpi, i) => {
          const a = ACCENT[kpi.accent];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden"
              style={{ borderColor: a.border }}
            >
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <div className="relative flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                  <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    background: kpi.trend === "up" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    color: kpi.trend === "up" ? "#10B981" : "#EF4444",
                    border: kpi.trend === "up" ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
                  }}>
                  {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.change}
                </div>
              </div>
              <p className="relative text-[28px] font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
              <p className="relative text-[13px] text-white/40 mt-1">{kpi.label}</p>
              {kpi.trendData.length >= 2 && (
                <div className="relative -mx-1 mt-2 opacity-70">
                  <Sparkline data={kpi.trendData} color={a.text} type={kpi.trendType} labels={kpi.trendLabels} valueFormatter={kpi.trendFmt} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ML Prediction Card */}
      {mlLoading ? (
        <div className="glass-card p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          <p className="text-sm text-white/40">Loading AI prediction...</p>
        </div>
      ) : mlData && (() => {
        const riskAccent = mlData.risk_level === "High" ? ACCENT.red : mlData.risk_level === "Medium" ? ACCENT.amber : ACCENT.green;
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5"
            style={{ borderColor: riskAccent.border }}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}`, boxShadow: `0 0 16px ${ACCENT.cyan.shadow}` }}>
                  <Brain className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-[11px] text-white/35 mb-0.5">AI Cost Overrun Prediction</p>
                  <p className="text-xl font-bold text-white">
                    {mlData.probability}% probability of overrun
                  </p>
                  <p className="text-[13px] text-white/40 mt-0.5">
                    Estimated overrun: {mlData.estimated_overrun_pct}% — {mlData.will_overrun ? "Action required" : "Under control"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm px-3 py-1.5 rounded-full font-medium"
                  style={{ background: riskAccent.bg, border: `1px solid ${riskAccent.border}`, color: riskAccent.text }}>
                  {mlData.risk_level} Risk
                </span>
                <button onClick={trainMlModel} disabled={trainLoading}
                  title="Retrain on the synthetic baseline plus your completed projects"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-white/80 whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  style={glassButtonStyle}>
                  {trainLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />}
                  Train Model
                </button>
              </div>
            </div>
            {mlData.trained_on && (
              <p className="text-[10px] text-white/25 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {mlData.model_version} — trained on {mlData.trained_on}
              </p>
            )}
          </motion.div>
        );
      })()}

      {/* Budget Burn Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-white text-[14px]">Budget Burn Rate</h3>
            <p className="text-[11px] text-white/35 mt-0.5">Budget vs Actual ($K)</p>
          </div>
          <TimeRangeSelector value={burnRange} onChange={setBurnRange} accent="cyan" />
        </div>
        {burnLoading && burnChartData.length === 0 ? (
          <div className="flex items-center justify-center h-56">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : burnChartData.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-white/25 text-[12px]">
            No cost entries found — add cost entries to see burn rate
          </div>
        ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={burnChartData}>
              <defs>
                <linearGradient id="budget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BURN_CHART_COLORS.budget} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={BURN_CHART_COLORS.budget} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BURN_CHART_COLORS.actual} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={BURN_CHART_COLORS.actual} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="budget" stroke={BURN_CHART_COLORS.budget} fill="url(#budget)" strokeWidth={2} name="Budget" />
              <Area type="monotone" dataKey="actual" stroke={BURN_CHART_COLORS.actual} fill="url(#actual)" strokeWidth={2} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: BURN_CHART_COLORS.budget, boxShadow: `0 0 6px ${BURN_CHART_COLORS.budget}` }} /><span className="text-[11px] text-white/35">Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: BURN_CHART_COLORS.actual, boxShadow: `0 0 6px ${BURN_CHART_COLORS.actual}` }} /><span className="text-[11px] text-white/35">Actual</span></div>
          </div>
        </>
        )}
      </motion.div>

      {/* Cash Flow + Material Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-white text-[14px]">Cash Flow Forecast</h3>
              <p className="text-[11px] text-white/35 mt-0.5">Inflow vs Outflow ($K)</p>
            </div>
            <TimeRangeSelector value={cashflowRange} onChange={setCashflowRange} accent="green" />
          </div>
          {cashflowLoading && cashflowChartData.length === 0 ? (
            <div className="flex items-center justify-center h-52">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : cashflowChartData.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-white/25 text-[12px]">
              No data — set project budgets to generate cash flow forecast
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashflowChartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
              <Bar dataKey="inflow"  fill={CASHFLOW_CHART_COLORS.inflow}  radius={[6, 6, 0, 0]} name="Inflow" />
              <Bar dataKey="outflow" fill={CASHFLOW_CHART_COLORS.outflow} radius={[6, 6, 0, 0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
          )}
          <div className="flex gap-5 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CASHFLOW_CHART_COLORS.inflow, boxShadow: `0 0 6px ${CASHFLOW_CHART_COLORS.inflow}` }} /><span className="text-[11px] text-white/35">Inflow</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CASHFLOW_CHART_COLORS.outflow, boxShadow: `0 0 6px ${CASHFLOW_CHART_COLORS.outflow}` }} /><span className="text-[11px] text-white/35">Outflow</span></div>
          </div>
        </motion.div>

        <MaterialPricesPanel />
      </div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Cost & Budget"
        placeholder="Ask about costs, budgets, forecasts..."
        pageSummaryData={{
          totalBudget: costKpis ? fmtMoney(costKpis.totalBudget) : "—",
          spentToDate: costKpis ? fmtMoney(costKpis.spentToDate) : "—",
          committedAmount: costKpis ? fmtMoney(costKpis.committedAmount) : "—",
          remaining: costKpis ? fmtMoney(Math.abs(costKpis.remaining)) : "—",
          costOverrun: costKpis ? `${costKpis.overrunPct.toFixed(1)}%` : "—",
          mlPrediction: mlData,
        }}
      />
    </div>
  );
}