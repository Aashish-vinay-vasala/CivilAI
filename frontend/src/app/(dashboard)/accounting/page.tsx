"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator, Upload, Loader2, FileText, DollarSign,
  Percent, Tag, AlertCircle, ChevronDown, ChevronUp,
  Hash, Calendar, CheckCircle2, Building2, X, BookOpen,
  ClipboardCheck, ChevronRight, LayoutDashboard, Database,
  Scale, TrendingUp, TrendingDown, Clock, RefreshCw,
  Copy, Trash2, AlertTriangle, Link2, Download,
  PieChart, Search, Sparkles, Type, FileSignature,
} from "lucide-react";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { drawMarkdownText } from "@/lib/pdfMarkdownText";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const SUB_TABS = [
  { id: "extract",   label: "Extract",    icon: Calculator },
  { id: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { id: "summary",   label: "Summary",    icon: PieChart },
  { id: "reports",   label: "AI Reports", icon: Sparkles },
  { id: "records",   label: "Records",    icon: Database },
  { id: "reconcile", label: "Reconcile",  icon: Scale },
  { id: "glossary",  label: "Glossary",   icon: BookOpen },
] as const;
type SubTab = typeof SUB_TABS[number]["id"];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Amount    { value: number; currency: string; raw: string; context: string }
interface Pct       { value: number; raw: string; context: string }
interface Term      { term: string; definition: string; context: string; alias_found: string }
interface KFigure   { label: string; value: number; currency: string; suffix: string }
interface LineItem  { [key: string]: unknown }

interface ExtractionResult {
  document_class:   string;
  document_subtype: string;
  currency:         string;
  period:           string;
  confidence:       number;
  summary:          string;
  key_figures:      KFigure[];
  structured_data:  Record<string, unknown>;
  all_amounts:      Amount[];
  all_percentages:  Pct[];
  reference_numbers: string[];
  dates_found:       string[];
  accounting_terms:  Term[];
  warnings:          string[];
  enrichment?:       Record<string, unknown>;
  file_url?:         string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CLASS_LABELS: Record<string, string> = {
  invoice:             "Invoice / Payment Certificate",
  financial_statement: "Financial Statement",
  boq:                 "Bill of Quantities",
  purchase_order:      "Purchase Order",
  contract:            "Contract",
  general:             "General Financial Document",
};

const CLASS_COLOR: Record<string, string> = {
  invoice:             "text-blue-400   border-blue-500/20   bg-blue-500/8",
  financial_statement: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",
  boq:                 "text-amber-400  border-amber-500/20  bg-amber-500/8",
  purchase_order:      "text-cyan-400   border-cyan-500/20   bg-cyan-500/8",
  contract:            "text-orange-400 border-orange-500/20 bg-orange-500/8",
  general:             "text-white/50   border-white/10      bg-white/5",
};

function fmt(val: number, currency = "") {
  const prefix = currency && !["USD","AUD","GBP","EUR","CAD"].includes(currency) ? "" : "";
  const sym: Record<string, string> = { USD:"$", AUD:"A$", GBP:"£", EUR:"€", CAD:"C$" };
  const s = sym[currency] ?? (currency ? currency + " " : "");
  if (val >= 1_000_000) return `${s}${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000)     return `${s}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${s}${val.toFixed(2)}`;
}

// ── Drop-zone ──────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className="relative flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer transition-all py-16 px-8"
      style={{
        border: `2px dashed ${dragging ? "rgba(0,212,255,0.5)" : "rgba(0,212,255,0.15)"}`,
        background: dragging ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "rgba(0,212,255,0.08)",
          border: "1px solid rgba(0,212,255,0.2)",
        }}
      >
        <Calculator className="w-8 h-8 text-cyan-400" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-white/70 font-medium text-[15px]">
          Drop a financial document here
        </p>
        <p className="text-white/30 text-[13px]">
          Invoices · BOQs · P&amp;L statements · Contracts · Purchase Orders
        </p>
        <p className="text-white/20 text-[11px]">
          PDF · Excel · Word · Image · CSV
        </p>
      </div>

      <div
        className="px-4 py-2 rounded-xl text-[13px] font-medium"
        style={{
          background: "rgba(0,212,255,0.1)",
          border: "1px solid rgba(0,212,255,0.25)",
          color: "#00D4FF",
        }}
      >
        Browse Files
      </div>
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, count, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; count?: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(0,212,255,0.08)", background: "rgba(255,255,255,0.02)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="text-white/80 font-medium text-[13px] flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {count}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Line items table ───────────────────────────────────────────────────────────

function LineItemsTable({ items }: { items: LineItem[] }) {
  if (!items || items.length === 0) return <p className="text-white/30 text-[13px]">No line items found</p>;

  const keys = Object.keys(items[0]).filter(k => k !== "notes");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {keys.map(k => (
              <th key={k} className="text-left text-white/40 font-semibold uppercase tracking-wide pb-2 pr-4 whitespace-nowrap">
                {k.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {items.map((row, i) => (
            <tr key={i}>
              {keys.map(k => {
                const v = row[k];
                const isNum = typeof v === "number";
                return (
                  <td key={k} className={`py-2 pr-4 text-white/70 ${isNum ? "text-right font-mono" : ""}`}>
                    {v === null || v === undefined ? (
                      <span className="text-white/20">—</span>
                    ) : isNum ? (
                      fmt(v as number)
                    ) : (
                      String(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Structured data recursive renderer ────────────────────────────────────────

function StructuredField({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return null;

  const displayLabel = label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  if (typeof value === "number") {
    return (
      <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
        <span className="text-white/45 text-[12px]">{displayLabel}</span>
        <span className="text-white/80 text-[12px] font-mono font-semibold">{fmt(value)}</span>
      </div>
    );
  }

  if (typeof value === "string" && value) {
    return (
      <div className="flex items-start justify-between py-2 border-b border-white/[0.04] gap-4">
        <span className="text-white/45 text-[12px] shrink-0">{displayLabel}</span>
        <span className="text-white/70 text-[12px] text-right">{value}</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
        <span className="text-white/45 text-[12px]">{displayLabel}</span>
        <span className={`text-[12px] font-semibold ${value ? "text-emerald-400" : "text-red-400"}`}>
          {value ? "Yes" : "No"}
        </span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const items = value as LineItem[];
    if (items.length > 0 && typeof items[0] === "object") {
      return (
        <div className="py-3">
          <p className="text-white/45 text-[12px] mb-2">{displayLabel}</p>
          <LineItemsTable items={items} />
        </div>
      );
    }
    return (
      <div className="flex items-start justify-between py-2 border-b border-white/[0.04] gap-4">
        <span className="text-white/45 text-[12px] shrink-0">{displayLabel}</span>
        <div className="flex flex-wrap gap-1 justify-end">
          {(value as string[]).map((v, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/8">
              {String(v)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      <div className="py-3">
        <p className="text-white/45 text-[12px] mb-2">{displayLabel}</p>
        <div className="pl-3 border-l border-white/[0.06] space-y-0">
          {Object.entries(obj).map(([k, v]) => (
            <StructuredField key={k} label={k} value={v} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ── Small shared states ─────────────────────────────────────────────────────────

function CenterLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
      <p className="text-white/40 text-[13px]">{label}</p>
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-[13px] bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0" /> {text}
    </div>
  );
}

function EmptyState({ text, icon: Icon = FileText }: { text: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon className="w-8 h-8 text-white/15" />
      <p className="text-white/30 text-[13px]">{text}</p>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl px-4 py-3.5 flex flex-col gap-1.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/35 uppercase tracking-wide">{label}</span>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <span className="text-white font-semibold text-[16px] font-mono">{value}</span>
    </div>
  );
}

// ── Project selector ──────────────────────────────────────────────────────────

interface ProjectOption { id: string; name: string }

function ProjectSelect({ projects, value, onChange }: {
  projects: ProjectOption[]; value: string; onChange: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-xl text-[13px] text-white/70 outline-none"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

interface DashboardKPIs {
  total_invoiced: number; total_received: number; total_pending: number; total_overdue: number;
  total_budget: number; total_committed: number; total_direct_costs: number;
  budget_utilization: number | null; budget_remaining: number | null;
  total_anomalies: number; high_severity_flags: number;
}
interface EVMSnapshot { cpi: number; spi: number; eac: number; bac: number; snapshot_date: string }
interface RecentExtraction { id: string; filename: string; doc_class: string; confidence: number; anomaly_count: number; created_at: string }
interface DashboardData { kpis: DashboardKPIs; evm: EVMSnapshot | null; recent_extractions: RecentExtraction[] }

function AccountingDashboardTab({ projectId }: { projectId: string }) {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    axios.get(`${API}/api/v1/accounting/dashboard`, { params: projectId ? { project_id: projectId } : {} })
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load financial dashboard"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CenterLoader label="Loading financial dashboard…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!data) return null;

  const { kpis, evm, recent_extractions } = data;
  const utilPct = kpis.budget_utilization ?? 0;
  const utilColor = utilPct > 100 ? "#EF4444" : utilPct > 85 ? "#F59E0B" : "#10B981";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-white/35 text-[12px]">Financial health across all connected modules</p>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/70 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total Invoiced" value={fmt(kpis.total_invoiced)} icon={DollarSign}   color="#00D4FF" />
        <KpiTile label="Received"       value={fmt(kpis.total_received)} icon={TrendingUp}   color="#10B981" />
        <KpiTile label="Pending"        value={fmt(kpis.total_pending)}  icon={Clock}         color="#F59E0B" />
        <KpiTile label="Overdue"        value={fmt(kpis.total_overdue)}  icon={AlertTriangle} color="#EF4444" />
        <KpiTile label="Total Budget"     value={fmt(kpis.total_budget)}       icon={Building2}      color="#00D4FF" />
        <KpiTile label="Committed"        value={fmt(kpis.total_committed)}    icon={ClipboardCheck} color="#A78BFA" />
        <KpiTile label="Direct Costs"     value={fmt(kpis.total_direct_costs)} icon={DollarSign}     color="#F97316" />
        <KpiTile label="Budget Remaining" value={kpis.budget_remaining !== null ? fmt(kpis.budget_remaining) : "—"} icon={Hash} color="#60A5FA" />
      </div>

      {/* Budget utilization + anomalies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/40">Budget Utilization</span>
            <span className="font-semibold" style={{ color: utilColor }}>{kpis.budget_utilization ?? "—"}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(utilPct, 100)}%`, background: utilColor }} />
          </div>
          {kpis.budget_remaining !== null && (
            <p className="text-[11px] text-white/30">Remaining: {fmt(kpis.budget_remaining)}</p>
          )}
        </div>

        <div className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-[12px] text-white/40">Anomalies Detected</p>
            <p className="text-[20px] font-semibold text-white font-mono">{kpis.total_anomalies}</p>
          </div>
          {kpis.high_severity_flags > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {kpis.high_severity_flags} high severity
            </span>
          )}
        </div>
      </div>

      {/* EVM snapshot */}
      {evm && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.1)" }}>
          <p className="text-[11px] text-white/35 uppercase tracking-wide mb-3">Latest EVM Snapshot · {evm.snapshot_date}</p>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-white/30">CPI</p>
              <p className={`text-[15px] font-mono font-semibold ${evm.cpi >= 1 ? "text-emerald-400" : "text-red-400"}`}>{evm.cpi?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">SPI</p>
              <p className={`text-[15px] font-mono font-semibold ${evm.spi >= 1 ? "text-emerald-400" : "text-red-400"}`}>{evm.spi?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">EAC</p>
              <p className="text-[15px] font-mono font-semibold text-white/80">{fmt(evm.eac)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">BAC</p>
              <p className="text-[15px] font-mono font-semibold text-white/80">{fmt(evm.bac)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent extractions */}
      <div>
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 px-1">Recent Extractions</p>
        {recent_extractions.length === 0 ? (
          <EmptyState text="No documents extracted yet" icon={FileText} />
        ) : (
          <div className="space-y-1.5">
            {recent_extractions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <FileText className="w-3.5 h-3.5 text-cyan-400/70 shrink-0" />
                <span className="text-[12px] text-white/70 flex-1 truncate">{r.filename}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CLASS_COLOR[r.doc_class] ?? CLASS_COLOR.general}`}>
                  {CLASS_LABELS[r.doc_class] ?? r.doc_class}
                </span>
                {r.anomaly_count > 0 && (
                  <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                    {r.anomaly_count} flag{r.anomaly_count !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[10px] text-white/25 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Records tab ───────────────────────────────────────────────────────────────

interface RecordSummary {
  id: string; project_id: string | null; filename: string; file_url: string | null;
  doc_class: string; doc_subtype: string;
  currency: string; period: string; confidence: number; summary: string;
  key_figures: KFigure[]; created_at: string;
}

function AccountingRecordsTab({ projectId }: { projectId: string }) {
  const { counters, triggerRefresh } = useDataRefreshStore();
  const [records, setRecords]     = useState<RecordSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [classFilter, setClassFilter] = useState("");
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [detail, setDetail]           = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    axios.get(`${API}/api/v1/accounting/records`, {
      params: {
        ...(projectId ? { project_id: projectId } : {}),
        ...(classFilter ? { doc_class: classFilter } : {}),
        limit: 50,
      },
    })
      .then((res) => setRecords(res.data.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [projectId, classFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { load(); }, [counters.accounting]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id); setDetail(null); setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/accounting/records/${id}`);
      setDetail(res.data.record);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this accounting record?")) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API}/api/v1/accounting/records/${id}`);
      setRecords((r) => r.filter((x) => x.id !== id));
      if (expandedId === id) setExpandedId(null);
      triggerRefresh("accounting");
    } catch { /* keep in list on failure */ }
    finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-[12px] text-white/60 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <option value="">All document types</option>
          {Object.entries(CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/70 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <CenterLoader label="Loading records…" />
      ) : records.length === 0 ? (
        <EmptyState text="No saved records yet — extractions are saved automatically from the Extract tab" icon={Database} />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={() => toggle(r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                <FileText className="w-4 h-4 text-cyan-400/70 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/80 font-medium truncate">{r.filename}</p>
                  <p className="text-[10px] text-white/30">{new Date(r.created_at).toLocaleString()} · confidence {Math.round((r.confidence || 0) * 100)}%</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${CLASS_COLOR[r.doc_class] ?? CLASS_COLOR.general}`}>
                  {CLASS_LABELS[r.doc_class] ?? r.doc_class}
                </span>
                {r.file_url && (
                  <a href={r.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    title="Download original document"
                    className="p-1.5 rounded-lg text-white/20 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors shrink-0">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
                <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} disabled={deletingId === r.id}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                  {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <ChevronRight className={`w-4 h-4 text-white/25 shrink-0 transition-transform ${expandedId === r.id ? "rotate-90" : ""}`} />
              </button>

              {expandedId === r.id && (
                <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 text-white/30 text-[12px] py-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading detail…
                    </div>
                  ) : detail ? (
                    <div className="space-y-2">
                      {typeof detail.summary === "string" && detail.summary && (
                        <p className="text-[12px] text-white/60 leading-relaxed">{detail.summary}</p>
                      )}
                      {Array.isArray(detail.key_figures) && detail.key_figures.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {(detail.key_figures as KFigure[]).map((kf, i) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                              <p className="text-[9px] text-white/30 uppercase">{kf.label}</p>
                              <p className="text-[12px] text-white/80 font-mono font-semibold">
                                {kf.suffix === "%" ? `${kf.value}%` : fmt(kf.value, kf.currency)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-white/25">Detail unavailable.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reconcile tab ─────────────────────────────────────────────────────────────

interface UnmatchedInvoice { invoice_id: string; invoice_number: string; amount: number; status: string; contractor: string }
interface DuplicateAmount  { invoice_number: string; amount: number; contractor: string; duplicate_of: string }
interface BudgetOverrun    { code: string; description: string; original_budget: number; total_spend: number; overrun: number; overrun_pct: number }
interface ReconcileData {
  unmatched_invoices: UnmatchedInvoice[];
  duplicate_amounts:  DuplicateAmount[];
  overpayments:       BudgetOverrun[];
  budget_status: { total_budget: number; total_committed: number; utilization_pct: number | null };
  summary: {
    total_invoices: number; total_invoiced: number; total_received: number; total_overdue: number;
    unmatched_count: number; duplicate_count: number; budget_overrun_count: number;
  };
  error?: string;
}

function AccountingReconcileTab({ projectId }: { projectId: string }) {
  const [data, setData]       = useState<ReconcileData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true); setData(null);
    axios.get(`${API}/api/v1/accounting/reconcile/${projectId}`)
      .then((res) => setData(res.data))
      .catch(() => setData({ error: "Reconciliation failed" } as ReconcileData))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (!projectId) return <EmptyState text="Select a project to run reconciliation" icon={Scale} />;
  if (loading) return <CenterLoader label="Cross-referencing invoices, budget & cost entries…" />;
  if (!data || data.error) return <ErrorBanner text={data?.error || "Reconciliation failed"} />;

  const { summary, budget_status, unmatched_invoices, duplicate_amounts, overpayments } = data;
  const allClear = summary.unmatched_count === 0 && summary.duplicate_count === 0 && summary.budget_overrun_count === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-white/35 text-[12px]">Cross-checks invoices against budget and cost entries</p>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/70 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Re-run
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Invoices"        value={String(summary.total_invoices)} icon={FileText}      color="#00D4FF" />
        <KpiTile label="Unmatched"       value={String(summary.unmatched_count)} icon={AlertTriangle} color={summary.unmatched_count > 0 ? "#EF4444" : "#10B981"} />
        <KpiTile label="Duplicates"      value={String(summary.duplicate_count)} icon={Copy}          color={summary.duplicate_count > 0 ? "#F59E0B" : "#10B981"} />
        <KpiTile label="Budget Overruns" value={String(summary.budget_overrun_count)} icon={TrendingDown} color={summary.budget_overrun_count > 0 ? "#EF4444" : "#10B981"} />
      </div>

      {budget_status.utilization_pct !== null && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className="text-white/40">Budget Committed</span>
            <span className="font-semibold text-white/70">{fmt(budget_status.total_committed)} / {fmt(budget_status.total_budget)}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-1.5 rounded-full" style={{
              width: `${Math.min(budget_status.utilization_pct ?? 0, 100)}%`,
              background: (budget_status.utilization_pct ?? 0) > 100 ? "#EF4444" : (budget_status.utilization_pct ?? 0) > 85 ? "#F59E0B" : "#10B981",
            }} />
          </div>
        </div>
      )}

      {allClear && (
        <div className="flex items-center gap-2 text-emerald-400 text-[13px] bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> No discrepancies found — invoices, budget, and cost entries reconcile cleanly.
        </div>
      )}

      {unmatched_invoices.length > 0 && (
        <Section title="Unmatched Invoices" icon={AlertTriangle} count={unmatched_invoices.length} defaultOpen>
          <div className="space-y-2">
            {unmatched_invoices.map((inv, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div>
                  <span className="text-white/70 font-medium">{inv.invoice_number || inv.invoice_id}</span>
                  <span className="text-white/30 ml-2">{inv.contractor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/25 text-[10px]">{inv.status}</span>
                  <span className="text-red-400 font-mono font-semibold">{fmt(inv.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {duplicate_amounts.length > 0 && (
        <Section title="Duplicate Amounts" icon={Copy} count={duplicate_amounts.length} defaultOpen>
          <div className="space-y-2">
            {duplicate_amounts.map((d, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
                style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}>
                <div>
                  <span className="text-white/70 font-medium">{d.invoice_number}</span>
                  <span className="text-white/30 ml-2">{d.contractor} · duplicate of {d.duplicate_of}</span>
                </div>
                <span className="text-amber-400 font-mono font-semibold">{fmt(d.amount)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {overpayments.length > 0 && (
        <Section title="Budget Overruns" icon={TrendingDown} count={overpayments.length} defaultOpen>
          <div className="space-y-2">
            {overpayments.map((o, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div>
                  <span className="text-white/70 font-medium">[{o.code}] {o.description}</span>
                  <span className="text-white/30 ml-2">budget {fmt(o.original_budget)} → spend {fmt(o.total_spend)}</span>
                </div>
                <span className="text-red-400 font-mono font-semibold">+{o.overrun_pct}%</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────────────

interface ProjectSummaryData {
  project_id: string;
  modules: Record<string, any>;
  financial_health: {
    original_budget: number; total_spent: number; total_invoiced: number;
    budget_remaining: number; budget_utilization: number | null;
  };
}

function AccountingSummaryTab({ projectId }: { projectId: string }) {
  const [data, setData]       = useState<ProjectSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true); setError(""); setData(null);
    axios.get(`${API}/api/v1/accounting/summary/${projectId}`)
      .then((res) => setData(res.data))
      .catch(() => setError("Could not build project financial summary"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (!projectId) return <EmptyState text="Select a project to see its cross-module financial summary" icon={PieChart} />;
  if (loading) return <CenterLoader label="Aggregating invoices, budget, contracts, POs, EVM…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!data) return null;

  const { modules, financial_health: fh } = data;
  const utilPct = fh.budget_utilization ?? 0;
  const utilColor = utilPct > 100 ? "#EF4444" : utilPct > 85 ? "#F59E0B" : "#10B981";

  const moduleCards: { key: string; label: string; icon: React.ElementType }[] = [
    { key: "invoices", label: "Invoices", icon: DollarSign },
    { key: "budget", label: "Budget Items", icon: Building2 },
    { key: "contracts", label: "Contracts", icon: FileSignature },
    { key: "cost_entries", label: "Cost Entries", icon: TrendingDown },
    { key: "purchase_orders", label: "Purchase Orders", icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-white/35 text-[12px]">Aggregated financial picture across every connected module</p>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/70 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between text-[12px] mb-2">
          <span className="text-white/40">Budget Utilization</span>
          <span className="font-semibold" style={{ color: utilColor }}>{fh.budget_utilization ?? "—"}%</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(utilPct, 100)}%`, background: utilColor }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <KpiTile label="Original Budget" value={fmt(fh.original_budget)} icon={Building2} color="#00D4FF" />
          <KpiTile label="Total Spent"     value={fmt(fh.total_spent)}     icon={TrendingDown} color="#F97316" />
          <KpiTile label="Total Invoiced"  value={fmt(fh.total_invoiced)}  icon={DollarSign} color="#A78BFA" />
          <KpiTile label="Remaining"       value={fmt(fh.budget_remaining)} icon={Hash} color="#10B981" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {moduleCards.map(({ key, label, icon: Icon }) => {
          const m = modules[key];
          if (!m) return null;
          return (
            <div key={key} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-[12px] text-white/60 font-medium">{label}</p>
                <span className="ml-auto text-[10px] text-white/30">{m.count ?? m.items_count ?? 0} record(s)</span>
              </div>
              <div className="space-y-1">
                {Object.entries(m).filter(([k]) => k !== "count" && k !== "items_count" && k !== "by_class" && k !== "latest_extractions").map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[11px]">
                    <span className="text-white/30">{k.replace(/_/g, " ")}</span>
                    <span className="text-white/70 font-mono">{typeof v === "number" ? fmt(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {modules.evm && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.1)" }}>
            <p className="text-[11px] text-white/35 uppercase tracking-wide mb-2">Latest EVM Snapshot</p>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div><span className="text-white/30">CPI </span><span className="text-white/80 font-mono">{modules.evm.cpi?.toFixed(2)}</span></div>
              <div><span className="text-white/30">SPI </span><span className="text-white/80 font-mono">{modules.evm.spi?.toFixed(2)}</span></div>
              <div><span className="text-white/30">EAC </span><span className="text-white/80 font-mono">{fmt(modules.evm.eac)}</span></div>
              <div><span className="text-white/30">BAC </span><span className="text-white/80 font-mono">{fmt(modules.evm.bac)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI Reports tab (cost analysis / payment summary / contract terms) ────────

function AccountingReportsTab({ projectId }: { projectId: string }) {
  const [costAnalysis, setCostAnalysis]   = useState<{ analysis: string; snapshot: any } | null>(null);
  const [costLoading, setCostLoading]     = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<{ analysis: string; kpis: any } | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [contractTerms, setContractTerms] = useState<{ total_value: number; active_count: number; contracts: any[] } | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);

  const loadCost = useCallback(() => {
    if (!projectId) return;
    setCostLoading(true);
    axios.get(`${API}/api/v1/accounting/cost-analysis/${projectId}`)
      .then((res) => setCostAnalysis(res.data))
      .catch(() => setCostAnalysis({ analysis: "Cost analysis failed", snapshot: null }))
      .finally(() => setCostLoading(false));
  }, [projectId]);

  const loadPayment = useCallback(() => {
    if (!projectId) return;
    setPaymentLoading(true);
    axios.get(`${API}/api/v1/accounting/payment-summary/${projectId}`)
      .then((res) => setPaymentSummary(res.data))
      .catch(() => setPaymentSummary({ analysis: "Payment summary failed", kpis: null }))
      .finally(() => setPaymentLoading(false));
  }, [projectId]);

  const loadContracts = useCallback(() => {
    if (!projectId) return;
    setContractsLoading(true);
    axios.get(`${API}/api/v1/accounting/contract-terms/${projectId}`)
      .then((res) => setContractTerms(res.data))
      .catch(() => setContractTerms(null))
      .finally(() => setContractsLoading(false));
  }, [projectId]);

  useEffect(() => { loadContracts(); }, [loadContracts]);

  if (!projectId) return <EmptyState text="Select a project to generate AI financial reports" icon={Sparkles} />;

  return (
    <div className="space-y-4">
      <Section title="AI Cost Analysis" icon={TrendingDown} defaultOpen>
        {!costAnalysis && !costLoading && (
          <button onClick={loadCost} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-medium"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}>
            <Sparkles className="w-3.5 h-3.5" /> Generate Cost Analysis
          </button>
        )}
        {costLoading && <CenterLoader label="Analyzing cost report…" />}
        {costAnalysis && (
          <div className="space-y-3">
            {costAnalysis.snapshot && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KpiTile label="Budget" value={fmt(costAnalysis.snapshot.total_budget)} icon={Building2} color="#00D4FF" />
                <KpiTile label="Spent" value={fmt(costAnalysis.snapshot.total_spent)} icon={TrendingDown} color="#F97316" />
                <KpiTile label="Invoiced" value={fmt(costAnalysis.snapshot.total_invoiced)} icon={DollarSign} color="#A78BFA" />
                <KpiTile label="Remaining" value={fmt(costAnalysis.snapshot.budget_remaining)} icon={Hash} color="#10B981" />
              </div>
            )}
            <p className="text-white/60 text-[13px] leading-relaxed whitespace-pre-wrap">{costAnalysis.analysis}</p>
          </div>
        )}
      </Section>

      <Section title="AI Payment Summary" icon={DollarSign} defaultOpen>
        {!paymentSummary && !paymentLoading && (
          <button onClick={loadPayment} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-medium"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}>
            <Sparkles className="w-3.5 h-3.5" /> Generate Payment Summary
          </button>
        )}
        {paymentLoading && <CenterLoader label="Analyzing payment cash flow…" />}
        {paymentSummary && (
          <div className="space-y-3">
            {paymentSummary.kpis && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KpiTile label="Invoiced" value={fmt(paymentSummary.kpis.total_invoiced)} icon={DollarSign} color="#00D4FF" />
                <KpiTile label="Received" value={fmt(paymentSummary.kpis.total_received)} icon={TrendingUp} color="#10B981" />
                <KpiTile label="Pending" value={fmt(paymentSummary.kpis.total_pending)} icon={Clock} color="#F59E0B" />
                <KpiTile label="Overdue" value={fmt(paymentSummary.kpis.total_overdue)} icon={AlertTriangle} color="#EF4444" />
              </div>
            )}
            <p className="text-white/60 text-[13px] leading-relaxed whitespace-pre-wrap">{paymentSummary.analysis || "No invoices found for this project"}</p>
          </div>
        )}
      </Section>

      <Section title="Contract Financial Terms" icon={FileSignature} count={contractTerms?.contracts?.length} defaultOpen>
        {contractsLoading ? (
          <CenterLoader label="Loading contract terms…" />
        ) : !contractTerms || contractTerms.contracts.length === 0 ? (
          <p className="text-white/30 text-[13px]">No contracts found for this project</p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-4 text-[12px] mb-2">
              <span className="text-white/40">Total value: <span className="text-white/80 font-mono">{fmt(contractTerms.total_value)}</span></span>
              <span className="text-white/40">Active: <span className="text-white/80 font-mono">{contractTerms.active_count}</span></span>
            </div>
            {contractTerms.contracts.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px]"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <span className="text-white/70 font-medium">{c.title}</span>
                  <span className="text-white/30 ml-2">{c.contractor}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/40"}`}>
                    {c.status}
                  </span>
                  <span className="text-white/80 font-mono font-semibold">{fmt(c.value)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Glossary tab ──────────────────────────────────────────────────────────────

interface GlossaryTerm { term: string; definition: string; aliases: string[] }

function AccountingGlossaryTab() {
  const [terms, setTerms]     = useState<GlossaryTerm[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback((q: string) => {
    setLoading(true);
    axios.get(`${API}/api/v1/accounting/glossary`, { params: q ? { search: q } : {} })
      .then((res) => setTerms(res.data.terms || []))
      .catch(() => setTerms([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms, aliases, definitions…"
          className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] text-white/70 placeholder:text-white/25 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        />
      </div>

      {loading ? (
        <CenterLoader label="Loading glossary…" />
      ) : terms.length === 0 ? (
        <EmptyState text="No terms match your search" icon={BookOpen} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {terms.map((t) => (
            <div key={t.term} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-start gap-2 flex-wrap mb-1.5">
                <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)", color: "#00D4FF" }}>
                  {t.term}
                </span>
                {t.aliases?.length > 0 && (
                  <span className="text-[10px] text-white/25 pt-1.5">aka {t.aliases.join(", ")}</span>
                )}
              </div>
              <p className="text-white/50 text-[12px] leading-relaxed">{t.definition}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Extraction PDF export ────────────────────────────────────────────────────

function flattenForPDF(obj: Record<string, unknown>, rows: [string, string][] = [], prefix = ""): [string, string][] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    const label = prefix ? `${prefix} → ${k.replace(/_/g, " ")}` : k.replace(/_/g, " ");
    if (typeof v === "object" && !Array.isArray(v)) {
      flattenForPDF(v as Record<string, unknown>, rows, label);
    } else if (Array.isArray(v)) {
      if (v.length === 0) continue;
      if (typeof v[0] === "object") {
        const summary = (v as Record<string, unknown>[])
          .map((item) => Object.entries(item).map(([ik, iv]) => `${ik}: ${iv}`).join(", "))
          .join(" | ");
        rows.push([label, summary]);
      } else {
        rows.push([label, (v as unknown[]).join(", ")]);
      }
    } else if (typeof v === "number") {
      rows.push([label, fmt(v)]);
    } else if (typeof v === "boolean") {
      rows.push([label, v ? "Yes" : "No"]);
    } else {
      rows.push([label, String(v)]);
    }
  }
  return rows;
}

function lastTableY(doc: jsPDF): number {
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function buildExtractionPDF(result: ExtractionResult, sourceFilename: string): jsPDF {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 20;

  doc.setFillColor(4, 11, 25);
  doc.rect(0, 0, pw, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Accounting Extraction Report", M, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${sourceFilename}  ·  ${new Date().toLocaleString()}`, M, 21);

  y = 36;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(CLASS_LABELS[result.document_class] ?? result.document_class, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(90, 90, 90);
  const metaLine = [
    result.document_subtype && result.document_subtype !== result.document_class ? result.document_subtype : null,
    result.currency ? `Currency: ${result.currency}` : null,
    result.period ? `Period: ${result.period}` : null,
    `Confidence: ${Math.round((result.confidence || 0) * 100)}%`,
  ].filter(Boolean).join("   ·   ");
  doc.text(metaLine, M, y);
  y += 8;

  if (result.summary) {
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    y = drawMarkdownText(doc, result.summary, M, y, pw - M * 2, { fontSize: 9.5 });
    y += 4;
  }

  if (result.key_figures.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Key Figures", M, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Label", "Value"]],
      body: result.key_figures.map((kf) => [kf.label, kf.suffix === "%" ? `${kf.value}%` : fmt(kf.value, kf.currency)]),
      theme: "striped", headStyles: { fillColor: [0, 100, 180] },
      margin: { left: M, right: M }, styles: { fontSize: 9 },
    });
    y = lastTableY(doc) + 8;
  }

  if (result.structured_data && Object.keys(result.structured_data).length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text("Extracted Fields", M, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Field", "Value"]], body: flattenForPDF(result.structured_data),
      theme: "striped", headStyles: { fillColor: [0, 100, 180] },
      margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2.5, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: "auto" } },
    });
    y = lastTableY(doc) + 8;
  }

  if (result.enrichment && Object.keys(result.enrichment).length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text("Cross-Module Context", M, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Field", "Value"]], body: flattenForPDF(result.enrichment),
      theme: "striped", headStyles: { fillColor: [16, 130, 110] },
      margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2.5, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: "auto" } },
    });
    y = lastTableY(doc) + 8;
  }

  if (result.all_amounts.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text("All Monetary Amounts", M, y); y += 4;
    autoTable(doc, {
      startY: y, head: [["Amount", "Currency", "Context"]],
      body: result.all_amounts.map((a) => [fmt(a.value, a.currency), a.currency || "—", a.context.slice(0, 90)]),
      theme: "striped", headStyles: { fillColor: [0, 100, 180] },
      margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 2.5, overflow: "linebreak" },
    });
    y = lastTableY(doc) + 8;
  }

  if (result.accounting_terms.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    doc.text("Accounting Terms Identified", M, y); y += 6;
    for (const t of result.accounting_terms) {
      if (y > 265) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 100, 180);
      doc.text(t.term, M, y); y += 4.5;
      doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
      y = drawMarkdownText(doc, t.definition, M, y, pw - M * 2, { fontSize: 8.5 });
      y += 3;
    }
  }

  if (result.warnings.length > 0) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(180, 60, 0);
    doc.text("Warnings", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 60, 0);
    drawMarkdownText(doc, result.warnings.join("  •  "), M, y, pw - M * 2, { fontSize: 9 });
  }

  return doc;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [activeTab, setActiveTab] = useState<SubTab>("extract");
  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");

  const [result, setResult]     = useState<ExtractionResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [filename, setFilename] = useState("");
  const [extractProjectId, setExtractProjectId] = useState("");
  const [extractMode, setExtractMode] = useState<"file" | "text">("file");
  const [pastedText, setPastedText]   = useState("");

  const [budgetCheck, setBudgetCheck]     = useState<any>(null);
  const [budgetChecking, setBudgetChecking] = useState(false);
  const [budgetFigureIdx, setBudgetFigureIdx] = useState(0);

  useEffect(() => {
    axios.get(`${API}/api/v1/projects/`)
      .then((res) => {
        const p = res.data.projects || [];
        setProjects(p);
        if (p.length > 0) setProjectId(p[0].id);
      })
      .catch(() => {});
  }, []);

  async function processFile(file: File) {
    setLoading(true);
    setError("");
    setResult(null);
    setBudgetCheck(null);
    setBudgetFigureIdx(0);
    setFilename(file.name);

    const form = new FormData();
    form.append("file", file);
    if (extractProjectId) form.append("project_id", extractProjectId);

    try {
      const res = await axios.post(`${API}/api/v1/accounting/extract`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      });
      setResult(res.data);
      triggerRefresh("accounting"); // extract defaults to save=true — persists a record
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
               || "Extraction failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function processText() {
    if (!pastedText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setBudgetCheck(null);
    setBudgetFigureIdx(0);
    setFilename("pasted-text.txt");

    try {
      const res = await axios.post(`${API}/api/v1/accounting/extract-text`, {
        text: pastedText,
        filename: "pasted-text.txt",
        project_id: extractProjectId || undefined,
        save: false,
      });
      setResult(res.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
               || "Extraction failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function checkAgainstBudget() {
    if (!result || !extractProjectId || result.key_figures.length === 0) return;
    setBudgetChecking(true);
    setBudgetCheck(null);
    try {
      const kf = result.key_figures[budgetFigureIdx];
      const res = await axios.post(`${API}/api/v1/accounting/analyze-budget`, {
        project_id: extractProjectId,
        extracted_total: kf.value,
        doc_class: result.document_class,
        currency: kf.currency || result.currency,
        doc_subtype: result.document_subtype,
      });
      setBudgetCheck(res.data);
    } catch {
      setBudgetCheck({ message: "Budget analysis failed" });
    } finally {
      setBudgetChecking(false);
    }
  }

  const docClass = result?.document_class ?? "general";
  const colorCls = CLASS_COLOR[docClass] ?? CLASS_COLOR.general;

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}
          >
            <Calculator className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white">Accounting</h1>
            <p className="text-white/35 text-[12px]">
              Extract, track, and reconcile project financials
            </p>
          </div>
        </div>
        {activeTab !== "extract" && (
          <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style={activeTab === id
              ? { background: "linear-gradient(135deg,rgba(0,212,255,0.2),rgba(29,78,216,0.2))", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }
              : { color: "rgba(255,255,255,0.35)", border: "1px solid transparent" }}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <AccountingDashboardTab projectId={projectId} />}
      {activeTab === "summary"   && <AccountingSummaryTab   projectId={projectId} />}
      {activeTab === "reports"   && <AccountingReportsTab   projectId={projectId} />}
      {activeTab === "records"   && <AccountingRecordsTab   projectId={projectId} />}
      {activeTab === "reconcile" && <AccountingReconcileTab projectId={projectId} />}
      {activeTab === "glossary"  && <AccountingGlossaryTab />}

      {/* Upload */}
      {activeTab === "extract" && !result && !loading && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <label className="text-[12px] text-white/40 shrink-0">Link to project (optional)</label>
            <select
              value={extractProjectId}
              onChange={(e) => setExtractProjectId(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-[12px] text-white/60 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="">No project (standalone)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {extractProjectId && (
              <span className="text-[11px] text-cyan-400/70">Enables budget, invoice, contract & EVM cross-checks</span>
            )}
          </div>

          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={() => setExtractMode("file")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={extractMode === "file" ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF" } : { color: "rgba(255,255,255,0.35)" }}>
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
            <button onClick={() => setExtractMode("text")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={extractMode === "text" ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF" } : { color: "rgba(255,255,255,0.35)" }}>
              <Type className="w-3.5 h-3.5" /> Paste Text
            </button>
          </div>

          {extractMode === "file" ? (
            <DropZone onFile={processFile} />
          ) : (
            <div className="space-y-3">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste invoice, BOQ, or financial statement text here…"
                rows={10}
                className="w-full px-4 py-3 rounded-2xl text-[13px] text-white/80 placeholder:text-white/25 outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,212,255,0.15)" }}
              />
              <button onClick={processText} disabled={!pastedText.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}>
                <Calculator className="w-4 h-4" /> Extract from Text
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-[13px] bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </motion.div>
      )}

      {/* Loading */}
      {activeTab === "extract" && loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center gap-4 py-20"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}>
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-white/60 font-medium text-[14px]">Extracting accounting data…</p>
            <p className="text-white/25 text-[12px]">{filename}</p>
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] text-white/25 text-center">
            <p>Classifying document type</p>
            <p>Running regex extraction on all numbers</p>
            <p>Matching accounting glossary terms</p>
            <p>AI structured extraction in progress</p>
          </div>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {activeTab === "extract" && result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Reset */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-white/40" />
                <span className="text-white/50 text-[13px] truncate max-w-xs">{filename}</span>
              </div>
              <div className="flex items-center gap-3">
                {result.file_url && (
                  <a href={result.file_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-cyan-400 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Original File
                  </a>
                )}
                <button
                  onClick={() => buildExtractionPDF(result, filename).save(`accounting-extract-${filename.replace(/\.[^.]+$/, "")}-${Date.now()}.pdf`)}
                  className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-cyan-400 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
                <button
                  onClick={() => { setResult(null); setError(""); setBudgetCheck(null); setBudgetFigureIdx(0); }}
                  className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> New document
                </button>
              </div>
            </div>

            {/* Document class badge + summary */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ border: "1px solid rgba(0,212,255,0.1)", background: "rgba(0,212,255,0.03)" }}
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-semibold ${colorCls}`}>
                  <Building2 className="w-3.5 h-3.5" />
                  {CLASS_LABELS[docClass] ?? docClass}
                </div>
                {result.document_subtype && result.document_subtype !== docClass && (
                  <span className="text-[11px] text-white/30 bg-white/5 border border-white/8 px-2.5 py-1 rounded-lg">
                    {result.document_subtype.replace(/_/g, " ")}
                  </span>
                )}
                {result.currency && (
                  <span className="text-[11px] text-white/40 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> {result.currency}
                  </span>
                )}
                {result.period && (
                  <span className="text-[11px] text-white/40 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {result.period}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] text-white/25">confidence</span>
                  <span className={`text-[11px] font-semibold ${result.confidence > 0.7 ? "text-emerald-400" : result.confidence > 0.5 ? "text-amber-400" : "text-red-400"}`}>
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
              </div>

              {result.summary && (
                <p className="text-white/60 text-[13px] leading-relaxed">{result.summary}</p>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="flex items-start gap-2 text-amber-400 text-[12px] bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{result.warnings.join(" · ")}</div>
                </div>
              )}
            </div>

            {/* Key Figures KPI row */}
            {result.key_figures.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {result.key_figures.map((kf, i) => (
                  <div
                    key={i}
                    className="rounded-xl px-4 py-3.5 flex flex-col gap-1"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <span className="text-[10px] text-white/35 uppercase tracking-wide">{kf.label}</span>
                    <span className="text-white font-semibold text-[16px] font-mono">
                      {kf.suffix === "%" ? `${kf.value}%` : fmt(kf.value, kf.currency)}
                      {kf.suffix && kf.suffix !== "%" ? ` ${kf.suffix}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Check against project budget */}
            {extractProjectId && result.key_figures.length > 0 && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Scale className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-[12px] text-white/60">Check</span>
                  <select
                    value={budgetFigureIdx}
                    onChange={(e) => setBudgetFigureIdx(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] text-white/60 outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {result.key_figures.map((kf, i) => (
                      <option key={i} value={i}>{kf.label} ({fmt(kf.value, kf.currency)})</option>
                    ))}
                  </select>
                  <span className="text-[12px] text-white/60">against this project's budget</span>
                  <button onClick={checkAgainstBudget} disabled={budgetChecking}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}>
                    {budgetChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
                    Check
                  </button>
                </div>
                {budgetCheck && (
                  budgetCheck.variance === null || budgetCheck.message ? (
                    <p className="text-[12px] text-white/40">{budgetCheck.message}</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <KpiTile label="vs Original" value={fmt(budgetCheck.variance_vs_original)} icon={TrendingDown} color="#00D4FF" />
                      <KpiTile label="vs Revised" value={fmt(budgetCheck.variance_vs_revised)} icon={TrendingDown} color="#A78BFA" />
                      <KpiTile label="Utilization" value={budgetCheck.utilization_pct !== null ? `${budgetCheck.utilization_pct}%` : "—"} icon={Percent}
                        color={budgetCheck.risk_level === "high" ? "#EF4444" : budgetCheck.risk_level === "medium" ? "#F59E0B" : "#10B981"} />
                      <KpiTile label="Risk" value={budgetCheck.risk_level} icon={AlertTriangle}
                        color={budgetCheck.risk_level === "high" ? "#EF4444" : budgetCheck.risk_level === "medium" ? "#F59E0B" : "#10B981"} />
                    </div>
                  )
                )}
              </div>
            )}

            {/* Cross-module action banners */}
            {(docClass === "boq" || docClass === "invoice") && (
              <a
                href="/compliance"
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" style={{ color: "#34d399" }} />
                <p className="text-[12px] flex-1" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Cross-check permit requirements and regulatory compliance for the costs and scope in this document.
                </p>
                <span className="text-[11px] font-medium whitespace-nowrap flex items-center gap-1" style={{ color: "#34d399" }}>
                  Check Compliance <ChevronRight className="w-3 h-3" />
                </span>
              </a>
            )}

            {/* Structured Data */}
            {result.structured_data && Object.keys(result.structured_data).length > 0 && (
              <Section title="Extracted Fields" icon={CheckCircle2} defaultOpen>
                <div className="space-y-0">
                  {Object.entries(result.structured_data)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([k, v]) => (
                      <StructuredField key={k} label={k} value={v} />
                    ))}
                </div>
              </Section>
            )}

            {/* Cross-Module Context (enrichment) */}
            {result.enrichment && Object.keys(result.enrichment).length > 0 && (
              <Section title="Cross-Module Context" icon={Link2} defaultOpen>
                <div className="space-y-0">
                  {Object.entries(result.enrichment)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => (
                      <StructuredField key={k} label={k} value={v} />
                    ))}
                </div>
              </Section>
            )}

            {/* All Monetary Amounts */}
            <Section
              title="All Monetary Amounts"
              icon={DollarSign}
              count={result.all_amounts.length}
              defaultOpen={result.all_amounts.length <= 20}
            >
              {result.all_amounts.length === 0 ? (
                <p className="text-white/30 text-[13px]">No monetary amounts found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left text-white/40 font-semibold uppercase tracking-wide pb-2 pr-4">Amount</th>
                        <th className="text-left text-white/40 font-semibold uppercase tracking-wide pb-2 pr-4">Currency</th>
                        <th className="text-left text-white/40 font-semibold uppercase tracking-wide pb-2">Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {result.all_amounts.map((a, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-4 text-white font-mono font-semibold whitespace-nowrap">
                            {fmt(a.value, a.currency)}
                          </td>
                          <td className="py-2 pr-4 text-white/40">{a.currency || "—"}</td>
                          <td className="py-2 text-white/40 truncate max-w-xs" title={a.context}>
                            {a.context.substring(0, 80)}
                            {a.context.length > 80 && "…"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Percentages */}
            {result.all_percentages.length > 0 && (
              <Section title="Percentages" icon={Percent} count={result.all_percentages.length} defaultOpen={false}>
                <div className="flex flex-wrap gap-2">
                  {result.all_percentages.map((p, i) => (
                    <div
                      key={i}
                      title={p.context}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span className="text-white font-mono font-semibold text-[13px]">{p.value}%</span>
                      <span className="text-white/35 text-[11px] max-w-[180px] truncate">{p.context.substring(0, 50)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Reference Numbers */}
            {result.reference_numbers.length > 0 && (
              <Section title="Reference Numbers" icon={Hash} count={result.reference_numbers.length} defaultOpen={false}>
                <div className="flex flex-wrap gap-2">
                  {result.reference_numbers.map((ref, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-mono text-cyan-400 bg-cyan-500/8 border border-cyan-500/15"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Dates */}
            {result.dates_found.length > 0 && (
              <Section title="Dates Found" icon={Calendar} count={result.dates_found.length} defaultOpen={false}>
                <div className="flex flex-wrap gap-2">
                  {result.dates_found.map((d, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-lg text-[12px] text-white/60 bg-white/5 border border-white/8"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Accounting Terms */}
            <Section
              title="Accounting Terms Identified"
              icon={BookOpen}
              count={result.accounting_terms.length}
              defaultOpen
            >
              {result.accounting_terms.length === 0 ? (
                <p className="text-white/30 text-[13px]">No known accounting terms detected</p>
              ) : (
                <div className="space-y-3">
                  {result.accounting_terms.map((t, i) => (
                    <div
                      key={i}
                      className="rounded-xl px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        <span
                          className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)", color: "#00D4FF" }}
                        >
                          {t.term}
                        </span>
                        {t.alias_found !== t.term && (
                          <span className="text-[10px] text-white/25 pt-1.5">found as "{t.alias_found}"</span>
                        )}
                      </div>
                      <p className="text-white/50 text-[12px] mt-2 leading-relaxed">{t.definition}</p>
                      {t.context && (
                        <p className="text-white/25 text-[11px] mt-1.5 font-mono leading-relaxed">
                          "…{t.context}…"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
