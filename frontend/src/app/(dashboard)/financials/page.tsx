"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign, TrendingUp, ChevronRight, Download, Filter, RefreshCw,
  Loader2, Clock, CheckCircle2, AlertCircle, FileSpreadsheet, History,
  ReceiptText, FolderOpen, Upload, X, AlertTriangle, CheckCheck, FileText,
  Building2, ChevronDown, Sparkles, Link2, Plus, Edit2, Trash2, PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import Sparkline from "@/components/shared/Sparkline";
import { ACCENT, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

const PROJECT_TABS = [
  { href: "/cost",        label: "Cost & Budget" },
  { href: "/financials",  label: "Financial Budget" },
  { href: "/procurement", label: "Procurement" },
];

const API = process.env.NEXT_PUBLIC_API_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

type ColKey = "originalBudget" | "budgetMods" | "approvedCOs" | "revisedBudget"
            | "pendingChanges" | "projectedBudget" | "committedCosts" | "directCosts";

type ViewMode     = "standard" | "committed" | "direct";
type SnapshotMode = "current"  | "original"  | "last-month";
type GroupMode    = "division" | "cost-code" | "project";
type ImportStep   = "upload" | "analyzing" | "review" | "details" | "confirm";

interface BudgetItem {
  id?: string;
  code: string; description: string; divCode: string; divName: string;
  originalBudget: number; budgetMods: number; approvedCOs: number;
  revisedBudget: number; pendingChanges: number; projectedBudget: number;
  committedCosts: number; directCosts: number;
}

interface BudgetDivision { code: string; name: string; items: BudgetItem[]; }

interface ProjectInfo {
  id: string; name: string;
  total_budget: number; spent_to_date: number;
  committed: number; direct: number;
  divisions: BudgetDivision[];
  hasRealItems: boolean;
}

interface ChangeHistoryEntry {
  id: string; date: string; user_name: string; field: string;
  division: string; delta: number; reason: string;
  project_id?: string | null;
}

type Totals = Record<ColKey, number>;
const ZERO: Totals = {
  originalBudget: 0, budgetMods: 0, approvedCOs: 0, revisedBudget: 0,
  pendingChanges: 0, projectedBudget: 0, committedCosts: 0, directCosts: 0,
};

interface ColMapping { file_header: string; canonical: string; }

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: ColKey; header: string;
  hColor: string; cellColor: (v: number) => string; bold?: boolean;
}

const COL_DEFS: ColDef[] = [
  { key: "originalBudget",  header: "Original Budget",  hColor: "text-white/40", cellColor: ()  => "text-white",      bold: true },
  { key: "budgetMods",      header: "Budget Mods",      hColor: "text-white/40", cellColor: (v) => v === 0 ? "text-white/40" : "text-white" },
  { key: "approvedCOs",     header: "Approved COs",     hColor: "text-blue-400",         cellColor: (v) => v === 0 ? "text-white/40" : "text-blue-400 font-medium" },
  { key: "revisedBudget",   header: "Revised Budget",   hColor: "text-white/40", cellColor: ()  => "text-white",      bold: true },
  { key: "pendingChanges",  header: "Pending COs",      hColor: "text-white/40", cellColor: (v) => v === 0 ? "text-white/40" : "text-white" },
  { key: "projectedBudget", header: "Projected Budget", hColor: "text-white/40", cellColor: ()  => "text-white",      bold: true },
  { key: "committedCosts",  header: "Committed Costs (Live)",  hColor: "text-orange-400",       cellColor: (v) => v === 0 ? "text-white/40" : "text-orange-400 font-medium" },
  { key: "directCosts",     header: "Direct Costs (Live)",     hColor: "text-blue-400",         cellColor: (v) => v === 0 ? "text-white/40" : "text-blue-400 font-medium" },
];

const COL_TOOLTIPS: Record<ColKey, string> = {
  originalBudget:  "The initial approved budget at project start",
  budgetMods:      "Manual budget adjustments, not from change orders",
  approvedCOs:     "Budget added by formally approved change orders",
  revisedBudget:   "Original Budget + Budget Mods + Approved COs",
  pendingChanges:  "Change orders submitted but not yet approved",
  projectedBudget: "Revised Budget + Pending COs — expected final budget",
  committedCosts:  "Live — pending/approved invoice amounts, allocated across this project's line items by budget share. Not editable here; add or update invoices on the Payments page to change it.",
  directCosts:     "Live — actual spend from cost entries, allocated across this project's line items by budget share. Not editable here; add or update cost entries on the Cost & Budget page to change it.",
};

const VIEW_KEYS: Record<ViewMode, ColKey[]> = {
  standard:  ["originalBudget","budgetMods","approvedCOs","revisedBudget","pendingChanges","projectedBudget","committedCosts","directCosts"],
  committed: ["originalBudget","budgetMods","approvedCOs","revisedBudget","projectedBudget","committedCosts"],
  direct:    ["originalBudget","directCosts"],
};

// ─── CSI Blueprint fallback ───────────────────────────────────────────────────

const CSI_BLUEPRINT = [
  { code:"01", name:"General Requirements",        pct:0.08, items:[
    { code:"01-010", desc:"Project Manager: Labor",          pct:0.25, coPct:0,     comPct:0,    dirPct:0.30 },
    { code:"01-011", desc:"Project Engineer: Labor",         pct:0.21, coPct:0,     comPct:0,    dirPct:0.25 },
    { code:"01-012", desc:"Superintendent: Labor",           pct:0.17, coPct:0,     comPct:0,    dirPct:0.22 },
    { code:"01-013", desc:"Project Coordinator: Labor",      pct:0.14, coPct:0,     comPct:0,    dirPct:0.06 },
    { code:"01-014", desc:"Project Executive: Labor",        pct:0.09, coPct:0,     comPct:0,    dirPct:0    },
    { code:"01-510", desc:"Temporary Utilities: Other",      pct:0.08, coPct:0,     comPct:0,    dirPct:0.06 },
    { code:"01-520", desc:"Construction Facilities: Other",  pct:0.04, coPct:0,     comPct:0,    dirPct:0.07 },
    { code:"01-560", desc:"Temporary Barriers & Enclosures", pct:0.02, coPct:0,     comPct:0,    dirPct:0.07 },
  ]},
  { code:"02", name:"Site Construction",            pct:0.05, items:[
    { code:"02-300", desc:"Earthwork: Commitment",   pct:0.47, coPct:0.096, comPct:0.47, dirPct:0 },
    { code:"02-900", desc:"Landscaping: Commitment", pct:0.53, coPct:0,     comPct:0.53, dirPct:0 },
  ]},
  { code:"03", name:"Concrete", pct:0.14, items:[
    { code:"03-100", desc:"Concrete Formwork",            pct:0.30, coPct:0.02, comPct:0.28, dirPct:0    },
    { code:"03-200", desc:"Concrete Reinforcing",         pct:0.25, coPct:0.02, comPct:0.24, dirPct:0    },
    { code:"03-300", desc:"Cast-in-Place Concrete",       pct:0.35, coPct:0.02, comPct:0.32, dirPct:0    },
    { code:"03-410", desc:"Precast Concrete: Direct",     pct:0.10, coPct:0,    comPct:0,    dirPct:0.09 },
  ]},
  { code:"04", name:"Masonry", pct:0.04, items:[
    { code:"04-200", desc:"Unit Masonry: Commitment",      pct:0.65, coPct:0, comPct:0.55, dirPct:0 },
    { code:"04-400", desc:"Stone Assemblies: Commitment",  pct:0.35, coPct:0, comPct:0.30, dirPct:0 },
  ]},
  { code:"05", name:"Metals", pct:0.10, items:[
    { code:"05-100", desc:"Structural Steel: Commitment",  pct:0.60, coPct:-0.01, comPct:0.55, dirPct:0    },
    { code:"05-200", desc:"Steel Joists: Commitment",      pct:0.25, coPct:-0.01, comPct:0.22, dirPct:0    },
    { code:"05-500", desc:"Metal Fabrications: Direct",    pct:0.15, coPct:0,     comPct:0,    dirPct:0.11 },
  ]},
  { code:"07", name:"Thermal & Moisture Protection", pct:0.07, items:[
    { code:"07-100", desc:"Waterproofing: Commitment",      pct:0.35, coPct:0, comPct:0.30, dirPct:0 },
    { code:"07-200", desc:"Thermal Insulation: Commitment", pct:0.30, coPct:0, comPct:0.27, dirPct:0 },
    { code:"07-500", desc:"Roofing: Commitment",            pct:0.35, coPct:0, comPct:0.32, dirPct:0 },
  ]},
  { code:"08", name:"Openings", pct:0.06, items:[
    { code:"08-100", desc:"Metal Doors & Frames",       pct:0.40, coPct:0, comPct:0.35, dirPct:0 },
    { code:"08-400", desc:"Entrances & Storefronts",    pct:0.35, coPct:0, comPct:0.30, dirPct:0 },
    { code:"08-800", desc:"Glazing: Commitment",        pct:0.25, coPct:0, comPct:0.20, dirPct:0 },
  ]},
  { code:"09", name:"Finishes", pct:0.09, items:[
    { code:"09-200", desc:"Plaster & Gypsum Board",    pct:0.30, coPct:0.015, comPct:0.25, dirPct:0    },
    { code:"09-300", desc:"Tiling: Commitment",        pct:0.25, coPct:0.015, comPct:0.20, dirPct:0    },
    { code:"09-650", desc:"Resilient Flooring",        pct:0.20, coPct:0.015, comPct:0.15, dirPct:0    },
    { code:"09-900", desc:"Paints & Coatings: Direct", pct:0.25, coPct:0,     comPct:0,    dirPct:0.18 },
  ]},
  { code:"10", name:"Specialties", pct:0.03, items:[
    { code:"10-100", desc:"Visual Display Units: Direct",  pct:0.40, coPct:0, comPct:0,    dirPct:0.35 },
    { code:"10-440", desc:"Fire Protection Specialties",   pct:0.60, coPct:0, comPct:0.50, dirPct:0    },
  ]},
  { code:"22", name:"Plumbing", pct:0.08, items:[
    { code:"22-000", desc:"Plumbing Systems: Commitment", pct:0.65, coPct:0, comPct:0.60, dirPct:0 },
    { code:"22-500", desc:"Pool & Fountain Plumbing",     pct:0.35, coPct:0, comPct:0.28, dirPct:0 },
  ]},
  { code:"23", name:"HVAC", pct:0.11, items:[
    { code:"23-000", desc:"HVAC Systems: Commitment",      pct:0.55, coPct:0, comPct:0.48, dirPct:0    },
    { code:"23-700", desc:"Central HVAC Equipment",        pct:0.30, coPct:0, comPct:0.28, dirPct:0    },
    { code:"23-800", desc:"Decentralized HVAC: Direct",    pct:0.15, coPct:0, comPct:0,    dirPct:0.10 },
  ]},
  { code:"26", name:"Electrical", pct:0.12, items:[
    { code:"26-050", desc:"Common Work: Commitment",       pct:0.20, coPct:0.03, comPct:0.18, dirPct:0    },
    { code:"26-100", desc:"Medium-Voltage Distribution",   pct:0.25, coPct:0.03, comPct:0.22, dirPct:0    },
    { code:"26-200", desc:"Low-Voltage Distribution",      pct:0.35, coPct:0.03, comPct:0.30, dirPct:0    },
    { code:"26-500", desc:"Lighting: Direct",              pct:0.20, coPct:0,    comPct:0,    dirPct:0.15 },
  ]},
];

function buildFallbackDivisions(totalBudget: number, committedTotal: number, directTotal: number): BudgetDivision[] {
  const pctSum = CSI_BLUEPRINT.reduce((s, d) => s + d.pct, 0);
  let totalComWeight = 0, totalDirWeight = 0;
  for (const div of CSI_BLUEPRINT) {
    const np = div.pct / pctSum;
    for (const item of div.items) {
      totalComWeight += np * item.pct * item.comPct;
      totalDirWeight += np * item.pct * item.dirPct;
    }
  }
  return CSI_BLUEPRINT.map((div) => {
    const np = div.pct / pctSum;
    const divBudget = totalBudget * np;
    return {
      code: div.code, name: div.name,
      items: div.items.map((item) => {
        const orig    = divBudget * item.pct;
        const co      = orig * item.coPct;
        const revised = orig + co;
        const cw      = np * item.pct * item.comPct;
        const dw      = np * item.pct * item.dirPct;
        return {
          code: item.code, description: item.desc, divCode: div.code, divName: div.name,
          originalBudget:  orig,
          budgetMods:      0,
          approvedCOs:     co,
          revisedBudget:   revised,
          pendingChanges:  0,
          projectedBudget: revised,
          committedCosts:  totalComWeight > 0 ? committedTotal * (cw / totalComWeight) : 0,
          directCosts:     totalDirWeight > 0 ? directTotal    * (dw / totalDirWeight) : 0,
        } as BudgetItem;
      }),
    };
  });
}

function dbItemsToDivisions(items: Record<string, unknown>[]): BudgetDivision[] {
  const divMap = new Map<string, BudgetDivision>();
  for (const raw of items) {
    const divCode = String(raw.div_code || "00");
    const divName = String(raw.div_name || "Uncategorized");
    if (!divMap.has(divCode)) divMap.set(divCode, { code: divCode, name: divName, items: [] });
    divMap.get(divCode)!.items.push({
      id:              String(raw.id || ""),
      code:            String(raw.code || ""),
      description:     String(raw.description || ""),
      divCode,
      divName,
      originalBudget:  Number(raw.original_budget  ?? 0),
      budgetMods:      Number(raw.budget_mods       ?? 0),
      approvedCOs:     Number(raw.approved_cos      ?? 0),
      revisedBudget:   Number(raw.revised_budget    ?? 0),
      pendingChanges:  Number(raw.pending_changes   ?? 0),
      projectedBudget: Number(raw.projected_budget  ?? 0),
      committedCosts:  Number(raw.committed_costs   ?? 0),
      directCosts:     Number(raw.direct_costs      ?? 0),
    });
  }
  return Array.from(divMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  if (v === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}
function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
// costTrend ("budget"/"actual") comes from the same chart API the Cost & Budget page uses,
// already scaled to $K — needs its own formatter so sparkline tooltips aren't 1000x too small.
function fmtMoneyK(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}M`;
  return `$${abs.toFixed(0)}K`;
}
function sumItems(items: BudgetItem[]): Totals {
  return items.reduce((acc, i) => ({
    originalBudget:  acc.originalBudget  + i.originalBudget,
    budgetMods:      acc.budgetMods      + i.budgetMods,
    approvedCOs:     acc.approvedCOs     + i.approvedCOs,
    revisedBudget:   acc.revisedBudget   + i.revisedBudget,
    pendingChanges:  acc.pendingChanges  + i.pendingChanges,
    projectedBudget: acc.projectedBudget + i.projectedBudget,
    committedCosts:  acc.committedCosts  + i.committedCosts,
    directCosts:     acc.directCosts     + i.directCosts,
  }), { ...ZERO });
}
function sumDivisions(divs: BudgetDivision[]): Totals {
  return divs.reduce((acc, d) => {
    const t = sumItems(d.items);
    return {
      originalBudget:  acc.originalBudget  + t.originalBudget,
      budgetMods:      acc.budgetMods      + t.budgetMods,
      approvedCOs:     acc.approvedCOs     + t.approvedCOs,
      revisedBudget:   acc.revisedBudget   + t.revisedBudget,
      pendingChanges:  acc.pendingChanges  + t.pendingChanges,
      projectedBudget: acc.projectedBudget + t.projectedBudget,
      committedCosts:  acc.committedCosts  + t.committedCosts,
      directCosts:     acc.directCosts     + t.directCosts,
    };
  }, { ...ZERO });
}

function applySnapshot(divs: BudgetDivision[], mode: SnapshotMode): BudgetDivision[] {
  if (mode === "current") return divs;
  return divs.map((d) => ({
    ...d,
    items: d.items.map((i) => {
      if (mode === "original")
        return { ...i, approvedCOs: 0, revisedBudget: i.originalBudget, projectedBudget: i.originalBudget, committedCosts: 0, directCosts: 0 };
      return { ...i, committedCosts: i.committedCosts * 0.82, directCosts: i.directCosts * 0.79 };
    }),
  }));
}

// ─── Validate File Modal ──────────────────────────────────────────────────────
// Quick, free (no AI cost) pre-flight check of a CSV/XLSX's column headers,
// separate from the full Import wizard which always runs AI extraction.

interface ValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  row_count: number;
  column_mapping: { file_header: string; canonical: string }[];
  preview: Record<string, unknown>[];
}

function ValidateModal({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ValidateResult | null>(null);

  async function pickFile(f: File) {
    setFileName(f.name);
    setResult(null);
    setChecking(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await axios.post(`${API}/api/v1/financials/import/validate`, fd);
      setResult(res.data);
    } catch {
      toast.error("Validation failed — check the file is a readable CSV or Excel file");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Validate File</h2>
              <p className="text-xs text-white/40">Check column headers before importing — no AI, no DB writes</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-[rgba(255,255,255,0.07)] hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-colors">
            {checking ? <Loader2 className="w-6 h-6 animate-spin text-cyan-400" /> : <FileSpreadsheet className="w-6 h-6 text-white/40" />}
            <span className="text-sm text-white font-medium">{fileName || "Choose a CSV or Excel file"}</span>
            <span className="text-xs text-white/40">Only column headers are checked — nothing is saved</span>
          </button>

          {result && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                result.valid ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {result.valid ? <CheckCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {result.valid ? `Valid — ${result.row_count} row(s) recognized` : "File has errors"}
              </div>

              {result.errors.length > 0 && (
                <ul className="space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}
                    </li>
                  ))}
                </ul>
              )}
              {result.warnings.length > 0 && (
                <ul className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}
                    </li>
                  ))}
                </ul>
              )}

              {result.column_mapping.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">Recognized Columns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.column_mapping.map((m, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-white">
                        "{m.file_header}" → {m.canonical}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">Preview (first {result.preview.length} rows)</p>
                  <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.07)]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[rgba(255,255,255,0.06)]">
                          {Object.keys(result.preview[0]).map((k) => (
                            <th key={k} className="text-left px-2.5 py-1.5 text-white/40 font-medium whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.map((row, i) => (
                          <tr key={i} className="border-t border-[rgba(255,255,255,0.07)]">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-2.5 py-1.5 text-white whitespace-nowrap">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="w-full border-[rgba(255,255,255,0.07)]">Close</Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
  projects,
  onClose,
  onSuccess,
}: {
  projects: ProjectInfo[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step,       setStep]       = useState<ImportStep>("upload");
  const [file,       setFile]       = useState<File | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [isAiPath,   setIsAiPath]   = useState(false);
  const [aiItems,    setAiItems]    = useState<Record<string, unknown>[]>([]);
  const [colMapping, setColMapping] = useState<ColMapping[]>([]);
  const [rowCount,   setRowCount]   = useState(0);
  const [warnings,   setWarnings]   = useState<string[]>([]);
  const [errors,     setErrors]     = useState<string[]>([]);
  const [source,     setSource]     = useState("ai_extraction");

  const [projectId,   setProjectId]   = useState(projects[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [notes,       setNotes]       = useState("");
  const [userName,    setUserName]    = useState("");

  const ACCEPTED = ".csv,.xlsx,.xls,.pdf,.doc,.docx";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function pickFile(f: File) {
    setFile(f);
    setErrors([]);
    setWarnings([]);
    setAiItems([]);
    setColMapping([]);
    setStep("analyzing");
    setAnalyzing(true);

    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await axios.post(`${API}/api/v1/financials/extract`, fd);
      const data = res.data;

      setAiItems(data.items || []);
      setRowCount(data.row_count || data.items?.length || 0);
      setWarnings(data.warnings || []);
      setIsAiPath(data.source === "ai_extraction");
      setColMapping(data.column_mapping || []);
      setSource(data.source || "ai_extraction");
      setStep("review");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrors([typeof detail === "string" ? detail : "Analysis failed — check that the file contains budget line items with descriptions and amounts."]);
      setStep("upload");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirmImport() {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("project_id", projectId || "all");
      fd.append("company_name", companyName.trim());
      fd.append("notes", notes.trim());
      fd.append("user_name", userName.trim() || companyName.trim());

      if (isAiPath || !file) {
        fd.append("items", JSON.stringify(aiItems));
        fd.append("source", source);
        const res = await axios.post(`${API}/api/v1/financials/import/from-items`, fd);
        toast.success(`Imported ${res.data.imported_rows} line items successfully`);
      } else {
        fd.append("file", file);
        const res = await axios.post(`${API}/api/v1/financials/import/confirm`, fd);
        toast.success(`Imported ${res.data.imported_rows} line items successfully`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const errList = Array.isArray(detail)
        ? detail.map((e: unknown) => String(e))
        : typeof detail === "object" && detail !== null && Array.isArray((detail as { errors?: unknown }).errors)
        ? ((detail as { errors: unknown[] }).errors).map(String)
        : [String(detail ?? "Import failed")];
      toast.error(errList[0]);
    } finally {
      setImporting(false);
    }
  }

  const stepLabels: Record<ImportStep, string> = {
    upload:    "1. File",
    analyzing: "2. Analyze",
    review:    "2. Review",
    details:   "3. Details",
    confirm:   "4. Confirm",
  };
  const stepOrder: ImportStep[] = ["upload", "analyzing", "review", "details", "confirm"];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Import Budget Data</h2>
              <p className="text-xs text-white/40">CSV · XLSX · XLS · PDF · Word — AI-powered detection</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            {(["upload","review","details","confirm"] as ImportStep[]).map((s, i) => {
              const reached = currentIdx >= stepOrder.indexOf(s) || step === "analyzing";
              return (
                <Fragment key={s}>
                  <span className={`px-2.5 py-1 rounded-full font-medium transition-colors ${reached ? "bg-blue-500/15 text-blue-400" : "text-white/40"}`}>
                    {stepLabels[s]}
                  </span>
                  {i < 3 && <ChevronRight className="w-3 h-3 text-white/40 shrink-0" />}
                </Fragment>
              );
            })}
          </div>

          {/* ── STEP 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-500/5" : "border-[rgba(255,255,255,0.07)] hover:border-blue-500/50"
                }`}
              >
                <input
                  ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }}
                />
                <Sparkles className="w-10 h-10 text-blue-400/60 mx-auto mb-3" />
                <p className="text-sm font-medium text-white">Drop any budget document here</p>
                <p className="text-xs text-white/40 mt-1">or click to browse</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {[".csv", ".xlsx", ".xls", ".pdf", ".doc", ".docx"].map((ext) => (
                    <span key={ext} className="text-[10px] px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-white/40 border border-[rgba(255,255,255,0.07)]">{ext}</span>
                  ))}
                </div>
                <p className="text-xs text-white/40 mt-3">
                  Column names are auto-detected — case-insensitive, flexible naming accepted
                </p>
              </div>

              {errors.length > 0 && (
                <div className="space-y-1.5">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2a: Analyzing ── */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Analyzing {file?.name}</p>
                <p className="text-xs text-white/40 mt-1">AI is detecting budget structure and extracting line items…</p>
              </div>
            </div>
          )}

          {/* ── STEP 2b: Review extracted items ── */}
          {step === "review" && (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)]">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file?.name}</p>
                  <p className="text-xs text-white/40">{(file?.size ?? 0 / 1024).toFixed(1)} KB</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isAiPath
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1"><Sparkles className="w-3 h-3" />AI extracted</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><CheckCheck className="w-3 h-3" />Structured parse</span>
                  }
                </div>
                <button onClick={() => { setFile(null); setStep("upload"); }} className="text-white/40 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary badge */}
              <div className="flex items-center gap-2 p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-emerald-400 text-sm font-medium">
                <CheckCheck className="w-4 h-4" /> {rowCount} line items detected and ready to import
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Warnings</p>
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}
                    </div>
                  ))}
                </div>
              )}

              {/* Column mapping (for structured parse) */}
              {colMapping.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Detected Column Mapping</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {colMapping.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-[rgba(255,255,255,0.03)] rounded-lg px-3 py-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-white/40 truncate">{m.file_header}</span>
                        <ChevronRight className="w-3 h-3 text-white/40 shrink-0" />
                        <span className="font-medium text-white truncate">{m.canonical}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              {aiItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Preview (first 5 rows)</p>
                  <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[rgba(255,255,255,0.05)]">
                            <th className="px-3 py-2 text-left text-white/40 font-medium">Code</th>
                            <th className="px-3 py-2 text-left text-white/40 font-medium">Description</th>
                            <th className="px-3 py-2 text-right text-white/40 font-medium">Orig. Budget</th>
                            <th className="px-3 py-2 text-right text-white/40 font-medium">Direct Costs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiItems.slice(0, 5).map((item, i) => (
                            <tr key={i} className="border-t border-[rgba(255,255,255,0.045)]">
                              <td className="px-3 py-1.5 text-blue-400 font-mono">{String(item.code || "—")}</td>
                              <td className="px-3 py-1.5 text-white max-w-48 truncate">{String(item.description || "")}</td>
                              <td className="px-3 py-1.5 text-right text-white">{fmtCurrency(Number(item.original_budget || 0))}</td>
                              <td className="px-3 py-1.5 text-right text-white">{fmtCurrency(Number(item.direct_costs || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {aiItems.length > 5 && (
                    <p className="text-xs text-white/40 text-right">+{aiItems.length - 5} more rows</p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={() => { setFile(null); setStep("upload"); }} className="border-[rgba(255,255,255,0.07)] flex-1">
                  Choose Different File
                </Button>
                <Button style={gradientButtonStyle} className="gradient-blue text-white border-0 flex-1" size="sm" onClick={() => setStep("details")}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Details form ── */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-xs text-white/40 flex items-center gap-2">
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {file?.name} · {rowCount} rows ready
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1.5">
                    Company / Organization Name <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5">
                    <Building2 className="w-4 h-4 text-white/40 shrink-0" />
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Construction Ltd."
                      className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/40 block mb-1.5">Project</label>
                  <div className="relative flex items-center bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5">
                    <FolderOpen className="w-4 h-4 text-white/40 shrink-0 mr-2" />
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-white outline-none appearance-none"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-white/40 shrink-0 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/40 block mb-1.5">Uploaded by (optional)</label>
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Your name or role"
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 block mb-1.5">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Q2 budget revision, approved by PM"
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 resize-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={() => setStep("review")} className="border-[rgba(255,255,255,0.07)] flex-1">Back</Button>
                <Button
                  style={gradientButtonStyle}
                  className="text-white border-0 flex-1"
                  size="sm"
                  disabled={!companyName.trim()}
                  onClick={() => setStep("confirm")}
                >
                  Review Import
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirm ── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">File</span>
                  <span className="text-white font-medium">{file?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Line items</span>
                  <span className="text-white font-medium">{rowCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Method</span>
                  <span className={`font-medium ${isAiPath ? "text-cyan-400" : "text-emerald-400"}`}>
                    {isAiPath ? "AI Extraction" : "Structured Parse"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Company</span>
                  <span className="text-white font-medium">{companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Project</span>
                  <span className="text-white font-medium">
                    {projects.find((p) => p.id === projectId)?.name ?? projectId}
                  </span>
                </div>
                {userName && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Uploaded by</span>
                    <span className="text-white font-medium">{userName}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
                This will replace all existing budget line items for the selected project.
              </p>

              <div className="flex gap-3">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={() => setStep("details")} className="border-[rgba(255,255,255,0.07)] flex-1" disabled={importing}>Back</Button>
                <Button style={gradientButtonStyle} className="gradient-blue text-white border-0 flex-1" size="sm" onClick={handleConfirmImport} disabled={importing}>
                  {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : "Confirm Import"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sync Modal ────────────────────────────────────────────────────────────────

function SyncModal({
  projects,
  onClose,
  onSuccess,
}: {
  projects: ProjectInfo[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [projectId,   setProjectId]   = useState(projects[0]?.id ?? "");
  const [syncing,     setSyncing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [syncData,    setSyncData]    = useState<{ items: Record<string, unknown>[]; summary: Record<string, unknown> } | null>(null);
  const [companyName, setCompanyName] = useState(projects.find(p => p.id === projectId)?.name ?? "");

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await axios.get(`${API}/api/v1/financials/sync-from-modules?project_id=${projectId}`);
      setSyncData(res.data);
      setCompanyName(projects.find(p => p.id === projectId)?.name ?? "");
    } catch {
      toast.error("Failed to fetch module data");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave() {
    if (!syncData?.items.length) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("company_name", companyName || "Sync");
      fd.append("notes", `Synced from construction cost codes on ${new Date().toLocaleDateString()}`);
      fd.append("source", "module_sync");
      fd.append("items", JSON.stringify(syncData.items));
      const res = await axios.post(`${API}/api/v1/financials/import/from-items`, fd);
      toast.success(`Synced ${res.data.imported_rows} cost codes to financial budget`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Sync save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-lg shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Sync from Modules</h2>
              <p className="text-xs text-white/40">Pull cost codes from Construction module</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Select Project</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5">
                <FolderOpen className="w-4 h-4 text-white/40 shrink-0 mr-2" />
                <select
                  value={projectId}
                  onChange={(e) => { setProjectId(e.target.value); setSyncData(null); }}
                  className="flex-1 bg-transparent text-sm text-white outline-none appearance-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <Button style={gradientButtonStyle} className="gradient-blue text-white border-0" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
              </Button>
            </div>
          </div>

          {syncData && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-center">
                  <p className="text-lg font-bold text-white">{Number(syncData.summary.cost_codes_count)}</p>
                  <p className="text-xs text-white/40 mt-0.5">Cost Codes</p>
                </div>
                <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-center">
                  <p className="text-lg font-bold text-blue-400">{fmtMoney(Number(syncData.summary.total_direct_from_invoices))}</p>
                  <p className="text-xs text-white/40 mt-0.5">Invoiced (Direct)</p>
                </div>
                <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-center">
                  <p className="text-lg font-bold text-orange-400">{fmtMoney(Number(syncData.summary.total_committed_from_invoices))}</p>
                  <p className="text-xs text-white/40 mt-0.5">Committed</p>
                </div>
              </div>

              {syncData.items.length > 0 ? (
                <>
                  <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
                    <div className="overflow-y-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-[rgba(255,255,255,0.05)]">
                          <tr>
                            <th className="px-3 py-2 text-left text-white/40 font-medium">Code</th>
                            <th className="px-3 py-2 text-left text-white/40 font-medium">Description</th>
                            <th className="px-3 py-2 text-right text-white/40 font-medium">Budget</th>
                            <th className="px-3 py-2 text-right text-white/40 font-medium">Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncData.items.map((item, i) => (
                            <tr key={i} className="border-t border-[rgba(255,255,255,0.045)]">
                              <td className="px-3 py-1.5 text-blue-400 font-mono">{String(item.code || "—")}</td>
                              <td className="px-3 py-1.5 text-white max-w-36 truncate">{String(item.description || "")}</td>
                              <td className="px-3 py-1.5 text-right text-white">{fmtCurrency(Number(item.original_budget || 0))}</td>
                              <td className="px-3 py-1.5 text-right text-white">{fmtCurrency(Number(item.direct_costs || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
                    This will replace existing budget line items for the selected project with these cost codes.
                  </p>

                  <div className="flex gap-3">
                    <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1">Cancel</Button>
                    <Button style={gradientButtonStyle} className="gradient-blue text-white border-0 flex-1" size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : `Sync ${syncData.items.length} items`}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-white/40">
                  <p className="text-sm">No cost codes found for this project.</p>
                  <p className="text-xs mt-1">Add cost codes in the Construction module first.</p>
                </div>
              )}
            </div>
          )}

          {!syncData && !syncing && (
            <p className="text-xs text-white/40 text-center py-4">
              Select a project and click Fetch to preview cost codes from the Construction module.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sync Project Budget Modal ─────────────────────────────────────────────────

function BudgetSyncModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preview, setPreview] = useState<{
    project_name: string; current_budget: number; itemized_total: number;
    difference: number; in_sync: boolean;
  } | null>(null);

  useEffect(() => {
    axios.get(`${API}/api/v1/financials/budget-sync-preview`, { params: { project_id: projectId } })
      .then((res) => setPreview(res.data))
      .catch(() => toast.error("Could not load sync preview"))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleConfirm() {
    setSyncing(true);
    try {
      await axios.post(`${API}/api/v1/financials/sync-project-budget`, { project_id: projectId });
      toast.success("Project budget synced");
      onSuccess();
      onClose();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const isDecrease = (preview?.difference ?? 0) < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Sync to Project Budget</h2>
              <p className="text-xs text-white/40">{preview?.project_name ?? "Loading…"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-center">
                  <p className="text-[11px] text-white/40 mb-1">Current Project Budget</p>
                  <p className="text-lg font-bold text-white">{fmtMoney(preview.current_budget)}</p>
                </div>
                <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-center">
                  <p className="text-[11px] text-white/40 mb-1">Sum of Line Items</p>
                  <p className="text-lg font-bold text-blue-400">{fmtMoney(preview.itemized_total)}</p>
                </div>
              </div>

              {preview.in_sync ? (
                <p className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                  Already in sync — no change needed.
                </p>
              ) : (
                <div className={`text-xs rounded-xl px-3 py-2.5 border ${isDecrease ? "text-red-400 bg-red-500/5 border-red-500/20" : "text-amber-400 bg-amber-500/5 border-amber-500/20"}`}>
                  <p className="font-semibold mb-1">
                    {isDecrease ? "This will DECREASE" : "This will increase"} the project budget by {fmtMoney(Math.abs(preview.difference))}.
                  </p>
                  <p className="text-white/40">
                    {isDecrease
                      ? "The itemized line items add up to less than the current budget — this usually means not every division has been entered yet. Only confirm if the line items are the complete, final budget."
                      : "The itemized line items add up to more than the current budget."}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1">Cancel</Button>
                <Button
                  style={isDecrease ? undefined : gradientButtonStyle}
                  className={`border-0 flex-1 text-white ${isDecrease ? "bg-red-600 hover:bg-red-500" : ""}`}
                  size="sm" onClick={handleConfirm} disabled={syncing || preview.in_sync}
                >
                  {syncing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Syncing…</> : "Confirm Sync"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/40 text-center py-4">Could not load preview.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Add / Edit Line Item Modal ───────────────────────────────────────────────

const EMPTY_FORM = {
  code: "", description: "", div_code: "00", div_name: "Uncategorized",
  original_budget: "", budget_mods: "", approved_cos: "", revised_budget: "",
  pending_changes: "", projected_budget: "",
};

const FIELD_LABELS: Record<string, string> = {
  code: "Code", description: "Description", div_code: "Division Code", div_name: "Division Name",
  original_budget: "Original Budget", budget_mods: "Budget Mods", approved_cos: "Approved COs",
  revised_budget: "Revised Budget", pending_changes: "Pending COs", projected_budget: "Projected Budget",
};
const NUMERIC_FORM_FIELDS = new Set([
  "original_budget", "budget_mods", "approved_cos", "revised_budget", "pending_changes", "projected_budget",
]);

function formFromItem(item: BudgetItem | null): Record<string, string> {
  return item
    ? {
        code:             item.code,
        description:      item.description,
        div_code:         item.divCode,
        div_name:         item.divName,
        original_budget:  String(item.originalBudget),
        budget_mods:      String(item.budgetMods),
        approved_cos:     String(item.approvedCOs),
        revised_budget:   String(item.revisedBudget),
        pending_changes:  String(item.pendingChanges),
        projected_budget: String(item.projectedBudget),
      }
    : { ...EMPTY_FORM };
}

// Defined at module scope (not inside ItemFormModal) so its identity is stable across
// re-renders — a component redefined inline on every render gets remounted by React
// on every keystroke, which drops input focus after each character typed.
function BudgetItemField({ label, value, numeric, onChange }: {
  label: string; value: string; numeric?: boolean; onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-1">{label}</label>
      <input
        type={numeric ? "number" : "text"}
        step={numeric ? "0.01" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:ring-1 focus:ring-blue-500"
        placeholder={numeric ? "0.00" : ""}
      />
    </div>
  );
}

function ItemFormModal({
  projectId,
  item,
  onClose,
  onSuccess,
}: {
  projectId: string;
  item: BudgetItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!item?.id;
  const [initialForm] = useState<Record<string, string>>(() => formFromItem(item));
  const [form, setForm] = useState<Record<string, string>>(() => formFromItem(item));
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function n(key: string) { return parseFloat(form[key]) || 0; }

  // Auto-compute revised and projected when numeric fields change
  function handleChange(key: string, val: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      const orig  = parseFloat(next.original_budget)  || 0;
      const mods  = parseFloat(next.budget_mods)       || 0;
      const cos   = parseFloat(next.approved_cos)      || 0;
      const pend  = parseFloat(next.pending_changes)   || 0;
      const rev   = orig + mods + cos;
      const proj  = rev  + pend;
      next.revised_budget   = rev  > 0 ? String(rev)  : next.revised_budget;
      next.projected_budget = proj > 0 ? String(proj) : next.projected_budget;
      return next;
    });
  }

  function handleReview() {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setConfirming(true);
  }

  const changedKeys = Object.keys(FIELD_LABELS).filter((k) => form[k] !== initialForm[k]);

  async function handleSave() {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    try {
      const body = {
        project_id:       projectId !== "all" ? projectId : undefined,
        code:             form.code.trim(),
        description:      form.description.trim(),
        div_code:         form.div_code.trim() || "00",
        div_name:         form.div_name.trim() || "Uncategorized",
        original_budget:  n("original_budget"),
        budget_mods:      n("budget_mods"),
        approved_cos:     n("approved_cos"),
        revised_budget:   n("revised_budget"),
        pending_changes:  n("pending_changes"),
        projected_budget: n("projected_budget"),
      };
      if (isEdit) {
        await axios.put(`${API}/api/v1/financials/items/${item!.id}`, body);
        toast.success("Line item updated");
      } else {
        await axios.post(`${API}/api/v1/financials/items`, body);
        toast.success("Line item added");
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setField(fkey: string, val: string) {
    setForm((p) => ({ ...p, [fkey]: val }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)] sticky top-0 bg-[rgba(4,11,25,0.94)] backdrop-blur-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              {isEdit ? <Edit2 className="w-4 h-4 text-blue-400" /> : <Plus className="w-4 h-4 text-blue-400" />}
            </div>
            <div>
              <h2 className="font-semibold text-white">{isEdit ? "Edit Line Item" : "Add Line Item"}</h2>
              <p className="text-xs text-white/40">{isEdit ? item!.description : "New budget line item"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {!confirming ? (
            <>
              {/* Identity */}
              <div className="grid grid-cols-2 gap-4">
                <BudgetItemField label="Code" value={form.code} onChange={(v) => setField("code", v)} />
                <div className="col-span-2">
                  <BudgetItemField label="Description *" value={form.description} onChange={(v) => setField("description", v)} />
                </div>
                <BudgetItemField label="Division Code" value={form.div_code} onChange={(v) => setField("div_code", v)} />
                <BudgetItemField label="Division Name" value={form.div_name} onChange={(v) => setField("div_name", v)} />
              </div>

              <div className="border-t border-[rgba(255,255,255,0.045)]" />

              {/* Numeric fields */}
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Budget Amounts</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <BudgetItemField label="Original Budget"   value={form.original_budget}  numeric onChange={(v) => handleChange("original_budget", v)} />
                  <BudgetItemField label="Budget Mods"        value={form.budget_mods}      numeric onChange={(v) => handleChange("budget_mods", v)} />
                  <BudgetItemField label="Approved COs"       value={form.approved_cos}     numeric onChange={(v) => handleChange("approved_cos", v)} />
                  <BudgetItemField label="Revised Budget"     value={form.revised_budget}   numeric onChange={(v) => handleChange("revised_budget", v)} />
                  <BudgetItemField label="Pending COs"        value={form.pending_changes}  numeric onChange={(v) => handleChange("pending_changes", v)} />
                  <BudgetItemField label="Projected Budget"   value={form.projected_budget} numeric onChange={(v) => handleChange("projected_budget", v)} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Costs</p>
                <div className="grid grid-cols-2 gap-4 text-xs text-white/50">
                  <div>
                    <p className="text-white/40 mb-1">Committed Costs</p>
                    <p className="text-white font-medium">{isEdit ? fmtCurrency(item!.committedCosts) : "$0.00"}</p>
                  </div>
                  <div>
                    <p className="text-white/40 mb-1">Direct Costs</p>
                    <p className="text-white font-medium">{isEdit ? fmtCurrency(item!.directCosts) : "$0.00"}</p>
                  </div>
                </div>
                <p className="text-[11px] text-white/35 mt-2">
                  Computed live from invoices &amp; cost entries — add or update spend on the Payments or Cost &amp; Budget pages to change these.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1">Cancel</Button>
                <Button style={gradientButtonStyle} className="gradient-blue text-white border-0 flex-1" size="sm" onClick={handleReview}>
                  {isEdit ? "Review Changes" : "Review & Add"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {isEdit && changedKeys.length === 0 ? (
                <p className="text-sm text-white/50">No fields were changed.</p>
              ) : (
                <div className="space-y-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-4">
                  {(isEdit ? changedKeys : Object.keys(FIELD_LABELS).filter((k) => form[k])).map((k) => (
                    <div key={k} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/40">{FIELD_LABELS[k]}</span>
                      {isEdit ? (
                        <span className="text-right">
                          <span className="text-white/40 line-through mr-2">
                            {NUMERIC_FORM_FIELDS.has(k) ? fmtCurrency(parseFloat(initialForm[k]) || 0) : (initialForm[k] || "—")}
                          </span>
                          <span className="text-white font-medium">
                            {NUMERIC_FORM_FIELDS.has(k) ? fmtCurrency(parseFloat(form[k]) || 0) : (form[k] || "—")}
                          </span>
                        </span>
                      ) : (
                        <span className="text-white font-medium">
                          {NUMERIC_FORM_FIELDS.has(k) ? fmtCurrency(parseFloat(form[k]) || 0) : form[k]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
                {isEdit
                  ? "This updates the line item immediately. It does not change the project's overall budget — use Sync to Project Budget below the table for that."
                  : "This adds a new line item immediately. Committed/Direct costs are computed live and can't be set here."}
              </p>

              <div className="flex gap-3 pt-2">
                <Button style={glassButtonStyle} variant="outline" size="sm" onClick={() => setConfirming(false)} className="border-[rgba(255,255,255,0.07)] flex-1" disabled={saving}>Back</Button>
                <Button style={gradientButtonStyle} className="gradient-blue text-white border-0 flex-1" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : isEdit ? "Confirm & Save" : "Confirm & Add"}
                </Button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Delete Confirmation Modal ─────────────────────────────────────────────────

function DeleteItemModal({
  item,
  deleting,
  onClose,
  onConfirm,
}: {
  item: BudgetItem;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-[rgba(0,212,255,0.15)] backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="font-semibold text-white">Delete Line Item</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-white/70">
            Delete <span className="text-white font-semibold">&quot;{item.description}&quot;</span> ({item.code || "no code"}, {item.divName})?
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
              <p className="text-white/40 mb-0.5">Original Budget</p>
              <p className="text-white font-medium">{fmtCurrency(item.originalBudget)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
              <p className="text-white/40 mb-0.5">Revised Budget</p>
              <p className="text-white font-medium">{fmtCurrency(item.revisedBudget)}</p>
            </div>
          </div>
          <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
            This can&apos;t be undone. It removes the line item only — it doesn&apos;t change the project&apos;s overall budget.
          </p>
          <div className="flex gap-3">
            <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1" disabled={deleting}>Cancel</Button>
            <Button size="sm" onClick={onConfirm} disabled={deleting} className="border-0 flex-1 text-white bg-red-600 hover:bg-red-500">
              {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : "Delete"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Delete All Confirmation Modal ─────────────────────────────────────────────

function DeleteAllModal({
  projectName,
  itemCount,
  itemTotal,
  deleting,
  onClose,
  onConfirm,
}: {
  projectName: string;
  itemCount: number;
  itemTotal: number;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText.trim().toUpperCase() === "DELETE" && !deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-red-500/30 backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="font-semibold text-white">Delete All Line Items</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-white/70">
            This permanently deletes <span className="text-white font-semibold">{itemCount}</span> line item{itemCount !== 1 ? "s" : ""}
            {" "}(totaling <span className="text-white font-semibold">{fmtCurrency(itemTotal)}</span> of Original Budget) from{" "}
            <span className="text-cyan-400 font-medium">{projectName}</span>.
          </p>
          <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
            This can&apos;t be undone. The itemized breakdown will fall back to a CSI-percentage estimate until you import or add items again.
            It does not change the project&apos;s overall budget.
          </p>
          <div>
            <label className="text-xs text-white/40 block mb-1.5">
              Type <span className="text-white font-semibold">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-3">
            <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1" disabled={deleting}>Back off</Button>
            <Button size="sm" onClick={onConfirm} disabled={!canDelete} className="border-0 flex-1 text-white bg-red-600 hover:bg-red-500 disabled:opacity-40">
              {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : "Delete All"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Delete All History Confirmation Modal ─────────────────────────────────────

function DeleteAllHistoryModal({
  projectName,
  entryCount,
  deleting,
  onClose,
  onConfirm,
}: {
  projectName: string;
  entryCount: number;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText.trim().toUpperCase() === "DELETE" && !deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgba(4,11,25,0.94)] border border-red-500/30 backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="font-semibold text-white">Delete All Change History</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-white/70">
            This permanently deletes <span className="text-white font-semibold">{entryCount}</span> history entr{entryCount !== 1 ? "ies" : "y"} for{" "}
            <span className="text-cyan-400 font-medium">{projectName}</span>.
          </p>
          <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
            This can&apos;t be undone. It clears the audit trail only — it doesn&apos;t change any budget line item or the project&apos;s overall budget.
          </p>
          <div>
            <label className="text-xs text-white/40 block mb-1.5">
              Type <span className="text-white font-semibold">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-3">
            <Button style={glassButtonStyle} variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.07)] flex-1" disabled={deleting}>Back off</Button>
            <Button size="sm" onClick={onConfirm} disabled={!canDelete} className="border-0 flex-1 text-white bg-red-600 hover:bg-red-500 disabled:opacity-40">
              {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : "Delete All"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const { counters, triggerRefresh } = useDataRefreshStore();
  const [activeTab,    setActiveTab]    = useState<"budget"|"history">("budget");
  const [loading,      setLoading]      = useState(true);
  const [projects,     setProjects]     = useState<ProjectInfo[]>([]);
  const [allDivisions, setAllDivisions] = useState<BudgetDivision[]>([]);
  const [history,      setHistory]      = useState<ChangeHistoryEntry[]>([]);
  const [showImport,   setShowImport]   = useState(false);
  const [showValidate, setShowValidate] = useState(false);
  const [showSync,     setShowSync]     = useState(false);
  const [showBudgetSync, setShowBudgetSync] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem,  setEditingItem]  = useState<BudgetItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<BudgetItem | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showDeleteAllHistory, setShowDeleteAllHistory] = useState(false);
  const [deletingAllHistory, setDeletingAllHistory] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [liveActuals,  setLiveActuals]  = useState<{
    project_budget: number;
    direct_costs: number;
    committed_costs: number;
    financial_items_total: number;
    has_financial_items: boolean;
    cost_codes_count: number;
    discrepancy_pct: number;
    in_sync: boolean;
    utilization_pct: number;
  } | null>(null);

  const [selectedPid, setSelectedPid] = useState("all");
  const [view,        setView]        = useState<ViewMode>("standard");
  const [snapshot,    setSnapshot]    = useState<SnapshotMode>("current");
  const [group,       setGroup]       = useState<GroupMode>("division");
  const [search,      setSearch]      = useState("");
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({});
  const [invoiceSummary, setInvoiceSummary] = useState({ pending: 0, pendingAmt: 0, overdue: 0, overdueAmt: 0 });
  // Same monthly budget/actual series the Cost & Budget page charts — reused here so
  // Original Budget / Direct Costs KPI cards can show a real sparkline instead of none.
  const [costTrend, setCostTrend] = useState<{ month: string; budget: number; actual: number }[]>([]);

  // Fetch live actuals whenever the project selection changes
  useEffect(() => {
    const params = selectedPid !== "all" ? `?project_id=${selectedPid}` : "";
    axios.get(`${API}/api/v1/financials/live-actuals${params}`)
      .then(r => setLiveActuals(r.data))
      .catch(() => setLiveActuals(null));
  }, [selectedPid, projects]); // re-run when projects load or selection changes

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, payRes, itemsRes, histRes, costChartRes] = await Promise.allSettled([
        axios.get(`${API}/api/v1/projects/`),
        axios.get(`${API}/api/v1/payments/invoices`),
        axios.get(`${API}/api/v1/financials/budget-items`),
        axios.get(`${API}/api/v1/financials/change-history`),
        axios.get(`${API}/api/v1/projects/charts/costs`),
      ]);
      setCostTrend(costChartRes.status === "fulfilled" ? (costChartRes.value.data.data || []) : []);

      let rawProjects: Record<string, unknown>[] = [];
      if (projRes.status === "fulfilled") rawProjects = projRes.value.data.projects || [];
      if (rawProjects.length === 0) rawProjects = [{ id: "demo", name: "Demo Project", total_budget: 2_450_000, spent_to_date: 930_000 }];

      let pendingCount = 0, pendingAmt = 0, overdueCount = 0, overdueAmt = 0;
      if (payRes.status === "fulfilled") {
        for (const inv of (payRes.value.data.invoices || [])) {
          if (inv.status === "pending") { pendingCount++; pendingAmt += inv.amount || 0; }
          if (inv.status === "overdue")  { overdueCount++;  overdueAmt  += inv.amount || 0; }
        }
      }
      setInvoiceSummary({ pending: pendingCount, pendingAmt, overdue: overdueCount, overdueAmt });

      const dbItems: Record<string, unknown>[] =
        itemsRes.status === "fulfilled" ? (itemsRes.value.data.items || []) : [];

      const hasRealItems = dbItems.length > 0;
      setUsingFallback(!hasRealItems);

      const itemsByProject = new Map<string, Record<string, unknown>[]>();
      for (const item of dbItems) {
        const pid = String(item.project_id || "all");
        if (!itemsByProject.has(pid)) itemsByProject.set(pid, []);
        itemsByProject.get(pid)!.push(item);
      }

      const projectList: ProjectInfo[] = rawProjects.map((p) => {
        const budget    = Number(p.total_budget    ?? 0);
        const spent     = Number(p.spent_to_date   ?? 0);
        // committed_amount = pending+overdue invoices via db_service — matches
        // /financials/live-actuals exactly, so this always agrees with the KPI cards.
        const committed = Number(p.committed_amount ?? 0);
        const direct    = spent; // direct costs = actual cost_entries spend

        const projItems     = itemsByProject.get(String(p.id)) ?? [];
        const hasProjItems  = projItems.length > 0;
        const divisions     = hasProjItems
          ? dbItemsToDivisions(projItems)
          : buildFallbackDivisions(budget || 2_450_000, committed, direct);

        return {
          id: String(p.id), name: String(p.name || `Project ${String(p.id).slice(0, 6)}`),
          total_budget: budget, spent_to_date: spent, committed, direct,
          divisions, hasRealItems: hasProjItems,
        };
      });
      setProjects(projectList);

      if (hasRealItems) {
        setAllDivisions(dbItemsToDivisions(dbItems));
      } else {
        const aggBudget    = projectList.reduce((s, p) => s + p.total_budget, 0) || 2_450_000;
        const aggCommitted = projectList.reduce((s, p) => s + p.committed, 0);
        const aggDirect    = projectList.reduce((s, p) => s + p.direct, 0);
        setAllDivisions(buildFallbackDivisions(aggBudget, aggCommitted, aggDirect));
      }

      const divCodes = new Set<string>([
        ...CSI_BLUEPRINT.map((d) => d.code),
        ...dbItems.map((i) => String(i.div_code || "00")),
      ]);
      const initCollapsed: Record<string, boolean> = {};
      divCodes.forEach((c) => { initCollapsed[c] = true; });
      setCollapsed(initCollapsed);

      if (histRes.status === "fulfilled") {
        setHistory(histRes.value.data.history || []);
      }
    } catch {
      toast.error("Failed to load financial data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh when cost entries or invoices change elsewhere — the budget
  // rollups above are derived from both.
  useEffect(() => { fetchData(); }, [counters.cost, counters.payments]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDataChanged = useCallback(() => {
    fetchData();
    triggerRefresh("financials");
  }, [fetchData, triggerRefresh]);

  // ── Export: generate CSV client-side from current data ───────────────────────

  const handleExport = useCallback(() => {
    const divsToExport = selectedPid !== "all"
      ? (projects.find(p => p.id === selectedPid)?.divisions ?? allDivisions)
      : allDivisions;

    if (divsToExport.length === 0 || divsToExport.every(d => d.items.length === 0)) {
      toast.error("No budget data to export");
      return;
    }

    // Server-side export — pulls the full DB record for this project rather than
    // just what's currently loaded/paginated on the client.
    const url = `${API}/api/v1/financials/export${selectedPid !== "all" ? `?project_id=${selectedPid}` : ""}`;
    window.open(url, "_blank");
    toast.success("Exporting budget to CSV…");
  }, [selectedPid, projects, allDivisions]);

  // ── Item CRUD ─────────────────────────────────────────────────────────────────

  function openAddItem() {
    setEditingItem(null);
    setShowItemForm(true);
  }

  function openEditItem(item: BudgetItem) {
    setEditingItem(item);
    setShowItemForm(true);
  }

  function openDeleteItem(item: BudgetItem) {
    if (!item.id) return;
    setConfirmDeleteItem(item);
  }

  async function handleDeleteItem() {
    const item = confirmDeleteItem;
    if (!item?.id) return;
    setDeletingItemId(item.id);
    try {
      await axios.delete(`${API}/api/v1/financials/items/${item.id}`);
      toast.success("Line item deleted");
      handleDataChanged();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingItemId(null);
      setConfirmDeleteItem(null);
    }
  }

  async function handleDeleteAll() {
    if (selectedPid === "all") return;
    setDeletingAll(true);
    try {
      const res = await axios.delete(`${API}/api/v1/financials/items`, { params: { project_id: selectedPid } });
      const count = res.data?.deleted_count ?? 0;
      toast.success(count > 0 ? `Deleted all ${count} line items` : "No line items to delete");
      handleDataChanged();
    } catch {
      toast.error("Delete all failed");
    } finally {
      setDeletingAll(false);
      setShowDeleteAll(false);
    }
  }

  async function handleDeleteAllHistory() {
    if (selectedPid === "all") return;
    setDeletingAllHistory(true);
    try {
      const res = await axios.delete(`${API}/api/v1/financials/change-history`, { params: { project_id: selectedPid } });
      const count = res.data?.deleted_count ?? 0;
      toast.success(count > 0 ? `Deleted all ${count} history entries` : "No history entries to delete");
      handleDataChanged();
    } catch {
      toast.error("Delete all failed");
    } finally {
      setDeletingAllHistory(false);
      setShowDeleteAllHistory(false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const rawDivisions = useMemo(() => {
    if (selectedPid === "all") return allDivisions;
    return projects.find((p) => p.id === selectedPid)?.divisions ?? allDivisions;
  }, [selectedPid, projects, allDivisions]);

  const snapshotDivisions = useMemo(() => applySnapshot(rawDivisions, snapshot), [rawDivisions, snapshot]);

  const filteredDivisions = useMemo(() => {
    if (!search) return snapshotDivisions;
    const q = search.toLowerCase();
    return snapshotDivisions
      .map((d) => ({ ...d, items: d.items.filter((i) => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) }))
      .filter((d) => d.items.length > 0 || d.name.toLowerCase().includes(q));
  }, [snapshotDivisions, search]);

  const flatItems   = useMemo(() => filteredDivisions.flatMap((d) => d.items).sort((a, b) => a.code.localeCompare(b.code)), [filteredDivisions]);
  const grand       = useMemo(() => sumDivisions(filteredDivisions), [filteredDivisions]);
  const activeCols  = useMemo(() => COL_DEFS.filter((c) => VIEW_KEYS[view].includes(c.key)), [view]);

  // Live canonical figures: projects.budget, cost_entries sum, invoices sum
  // These override the line-item table totals for the top-level KPI cards
  const liveGrand = useMemo(() => ({
    originalBudget: liveActuals?.project_budget  ?? grand.originalBudget,
    committedCosts: liveActuals?.committed_costs  ?? grand.committedCosts,
    directCosts:    liveActuals?.direct_costs     ?? grand.directCosts,
    revisedBudget:  grand.revisedBudget,
  }), [liveActuals, grand]);

  const isCollapsed = (code: string) => collapsed[code] !== false;
  const toggleDiv   = (code: string) => setCollapsed((p) => ({ ...p, [code]: !isCollapsed(code) }));
  const expandAll   = () => setCollapsed((p) => Object.fromEntries(Object.keys(p).map((k) => [k, false])));
  const collapseAll = () => setCollapsed((p) => Object.fromEntries(Object.keys(p).map((k) => [k, true])));

  const selectedProject = selectedPid !== "all" ? projects.find((p) => p.id === selectedPid) : null;
  const projectCount    = selectedPid === "all" ? projects.length : 1;

  // Only real (DB-backed) items would actually be deleted by "Delete All" —
  // CSI-fallback estimate rows have no `id` and don't exist in the database.
  const realItemsForSelected = useMemo(
    () => (selectedProject ? selectedProject.divisions.flatMap((d) => d.items).filter((i) => i.id) : []),
    [selectedProject]
  );

  // The history list isn't fetched pre-filtered by project, so scope it to whatever
  // "Delete All" would actually delete — otherwise the visible list and the count
  // shown in the confirmation dialog wouldn't match what gets removed.
  const historyForSelected = useMemo(
    () => (selectedPid === "all" ? history : history.filter((h) => h.project_id === selectedPid)),
    [history, selectedPid]
  );

  const kpis = [
    { label: "Original Budget", value: fmtMoney(liveGrand.originalBudget), sub: `${projectCount} project${projectCount !== 1 ? "s" : ""}`,  icon: DollarSign,  accent: ACCENT.blue,
      trendData: costTrend.map((d) => d.budget), trendType: "area" as const, trendLabels: costTrend.map((d) => d.month), trendFmt: fmtMoneyK },
    { label: "Approved COs",    value: fmtMoney(grand.approvedCOs),         sub: liveGrand.originalBudget > 0 ? `${((grand.approvedCOs / liveGrand.originalBudget) * 100).toFixed(2)}% of budget` : "—", icon: CheckCircle2, accent: ACCENT.green,
      trendData: [] as number[], trendType: "line" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
    { label: "Direct Costs",    value: fmtMoney(liveGrand.directCosts),     sub: liveGrand.originalBudget > 0 ? `${((liveGrand.directCosts / liveGrand.originalBudget) * 100).toFixed(1)}% of budget` : "—", icon: TrendingUp, accent: ACCENT.cyan,
      trendData: costTrend.map((d) => d.actual), trendType: "area" as const, trendLabels: costTrend.map((d) => d.month), trendFmt: fmtMoneyK },
    { label: "Committed Costs", value: fmtMoney(liveGrand.committedCosts),  sub: liveGrand.originalBudget > 0 ? `${((liveGrand.committedCosts / liveGrand.originalBudget) * 100).toFixed(1)}% committed` : "—", icon: AlertCircle, accent: ACCENT.amber,
      trendData: [] as number[], trendType: "line" as const, trendLabels: [] as string[], trendFmt: fmtMoneyK },
  ];

  // ── Budget distribution bar ──────────────────────────────────────────────────

  const BudgetDistributionCard = () => {
    // Prefer live canonical figures; fall back to line-item totals
    const baseBudget   = liveGrand.originalBudget  || grand.revisedBudget;
    const committedAmt = liveGrand.committedCosts;
    const directAmt    = liveGrand.directCosts;
    if (loading || baseBudget === 0) return null;
    const totalSpent  = committedAmt + directAmt;
    const remaining   = Math.max(0, baseBudget - totalSpent);
    const overrun     = Math.max(0, totalSpent - baseBudget);
    const base        = baseBudget + overrun || 1;
    const pctCommitted = (committedAmt / base) * 100;
    const pctDirect    = (directAmt    / base) * 100;
    const pctRemaining = (remaining / base) * 100;
    const pctOverrun   = (overrun   / base) * 100;
    const isOverrun    = overrun > 0;
    const totalUsedPct = ((totalSpent / baseBudget) * 100).toFixed(1);

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-white">Budget Distribution</h3>
            <p className="text-xs text-white/40 mt-0.5">
              Project budget {fmtMoney(baseBudget)} · Used {fmtMoney(totalSpent)} ({totalUsedPct}%)
            </p>
          </div>
          {isOverrun ? (
            <span className="text-xs px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">{pctOverrun.toFixed(1)}% over budget</span>
          ) : (
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">{(100 - Number(totalUsedPct)).toFixed(1)}% remaining</span>
          )}
        </div>
        <div className="h-7 flex rounded-xl overflow-hidden gap-px bg-[rgba(255,255,255,0.05)]">
          {pctCommitted > 0 && (
            <motion.div initial={{ width: 0 }} animate={{ width: `${pctCommitted}%` }} transition={{ duration: 0.8, delay: 0.3 }}
              title={`Committed Costs — ${fmtCurrency(committedAmt)}`}
              className="bg-orange-500 flex items-center justify-center text-[10px] text-white font-medium shrink-0">
              {pctCommitted > 8 && `${pctCommitted.toFixed(0)}%`}
            </motion.div>
          )}
          {pctDirect > 0 && (
            <motion.div initial={{ width: 0 }} animate={{ width: `${pctDirect}%` }} transition={{ duration: 0.8, delay: 0.4 }}
              title={`Direct Costs — ${fmtCurrency(directAmt)}`}
              className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-medium shrink-0">
              {pctDirect > 5 && `${pctDirect.toFixed(0)}%`}
            </motion.div>
          )}
          {isOverrun ? (
            <motion.div initial={{ width: 0 }} animate={{ width: `${pctOverrun}%` }} transition={{ duration: 0.8, delay: 0.5 }}
              title={`Overrun — ${fmtCurrency(overrun)}`}
              className="bg-red-500 flex items-center justify-center text-[10px] text-white font-medium shrink-0">
              {pctOverrun > 5 && `+${pctOverrun.toFixed(0)}%`}
            </motion.div>
          ) : (
            <motion.div initial={{ width: 0 }} animate={{ width: `${pctRemaining}%` }} transition={{ duration: 0.8, delay: 0.5 }}
              title={`Remaining — ${fmtCurrency(remaining)}`} className="bg-[rgba(255,255,255,0.05)] min-w-0" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-orange-500 shrink-0" />
            <span className="text-white/40">Committed <span className="text-white font-medium ml-1">{fmtMoney(committedAmt)}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
            <span className="text-white/40">Direct Costs <span className="text-white font-medium ml-1">{fmtMoney(directAmt)}</span></span>
          </div>
          {isOverrun ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shrink-0" />
              <span className="text-white/40">Overrun <span className="text-red-400 font-medium ml-1">{fmtMoney(overrun)}</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.05)] shrink-0" />
              <span className="text-white/40">Remaining <span className="text-emerald-400 font-medium ml-1">{fmtMoney(remaining)}</span></span>
            </div>
          )}
          <div className="ml-auto text-white/40">
            Pending COs <span className="text-white font-medium">{fmtMoney(grand.pendingChanges)}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  // ── Connected modules panel ──────────────────────────────────────────────────

  const ConnectedModulesPanel = () => {
    const burnPct = liveGrand.originalBudget > 0
      ? (((liveGrand.committedCosts + liveGrand.directCosts) / liveGrand.originalBudget) * 100).toFixed(1)
      : null;
    const tiles: { icon: typeof TrendingUp; label: string; value: string; sub: string; href: string; color: string; bg: string; border: string }[] = [
      { icon: TrendingUp,    label: "Cost & Budget",  value: burnPct !== null ? `${burnPct}% utilized` : "—",                                             sub: "Burn rate & cash flow",         href: "/cost",      color: "text-blue-400",    bg: "bg-blue-500/10",    border: "hover:border-blue-500/30"   },
      { icon: ReceiptText,   label: "Payments",       value: invoiceSummary.pending > 0 ? fmtMoney(invoiceSummary.pendingAmt) : "Up to date",              sub: `${invoiceSummary.pending} pending · ${invoiceSummary.overdue} overdue`, href: "/payments",  color: invoiceSummary.overdue > 0 ? "text-red-400" : invoiceSummary.pending > 0 ? "text-amber-400" : "text-emerald-400", bg: invoiceSummary.overdue > 0 ? "bg-red-500/10" : invoiceSummary.pending > 0 ? "bg-amber-500/10" : "bg-emerald-500/10", border: "hover:border-orange-500/30" },
      { icon: FileSpreadsheet, label: "EVM Dashboard", value: "CPI / SPI",                                                                               sub: "Earned value performance",      href: "/evm",       color: "text-cyan-400",  bg: "bg-cyan-500/10", border: "hover:border-cyan-500/30" },
      { icon: FileText,      label: "Contracts",      value: liveGrand.committedCosts > 0 ? fmtMoney(liveGrand.committedCosts) : "—",                    sub: "Committed via invoices",        href: "/contracts", color: "text-teal-400",   bg: "bg-teal-500/10",   border: "hover:border-teal-500/30"   },
    ];
    return (
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2.5">Connected Modules</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((tile, i) => (
            <Link key={i} href={tile.href}
              className={`flex items-center gap-3 p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.07)] ${tile.border} transition-all group`}>
              <div className={`w-9 h-9 rounded-xl ${tile.bg} flex items-center justify-center shrink-0`}>
                <tile.icon className={`w-4 h-4 ${tile.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white/40">{tile.label}</p>
                <p className={`text-sm font-semibold ${tile.color} truncate`}>{tile.value}</p>
                <p className="text-[10px] text-white/40 truncate">{tile.sub}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    );
  };

  // ── Table sub-components ─────────────────────────────────────────────────────

  const Cell = ({ col, val, bold }: { col: ColDef; val: number; bold?: boolean }) => (
    <span className={`${col.cellColor(val)}${bold ? " font-semibold" : ""}`}>{fmtCurrency(val)}</span>
  );

  const TableHead = () => (
    <thead>
      <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)]">
        <th className="sticky left-0 z-10 bg-[rgba(255,255,255,0.06)] text-left py-3 px-4 text-xs font-semibold text-white/40 w-72 min-w-[288px]">Description</th>
        {activeCols.map((c) => (
          <th key={c.key} title={COL_TOOLTIPS[c.key]}
            className={`py-3 px-4 text-right text-xs font-semibold ${c.hColor} whitespace-nowrap min-w-30 cursor-help`}>
            {c.header}
          </th>
        ))}
        <th className="py-3 px-3 text-center text-xs font-semibold text-white/40 w-16 whitespace-nowrap">Actions</th>
      </tr>
    </thead>
  );

  const GrandTotalRow = ({ totals }: { totals: Totals }) => (
    <tr className="bg-[rgba(255,255,255,0.04)] border-t-2 border-[rgba(255,255,255,0.08)]">
      <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.06)] py-3.5 px-4 font-bold text-white">Grand Total</td>
      {activeCols.map((c) => (
        <td key={c.key} className="py-3.5 px-4 text-right">
          <span className={`font-bold ${c.hColor}`}>{fmtCurrency(totals[c.key])}</span>
        </td>
      ))}
      <td />
    </tr>
  );

  // Estimated (CSI-fallback) rows have no `id` — they aren't real database rows,
  // they're a proportional split of the project's totals computed on the fly.
  // Edit/Delete can't act on them (there's nothing to update or delete), so show
  // a plain badge instead of buttons that would silently no-op or, worse, look
  // like an edit while actually creating an unrelated new real item.
  const ItemActions = ({ item }: { item: BudgetItem }) => (
    <td className="py-2.5 px-3 text-center">
      {!item.id ? (
        <span title="Estimated from the project total — add a real line item to edit or delete it" className="text-[10px] text-white/25 cursor-help">est.</span>
      ) : (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEditItem(item); }}
            title="Edit"
            className="p-1 rounded text-white/40 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openDeleteItem(item); }}
            title="Delete"
            disabled={deletingItemId === item.id}
            className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deletingItemId === item.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </td>
  );

  const DivisionBody = ({ divs }: { divs: BudgetDivision[] }) => (
    <>
      {divs.map((div) => {
        const tot  = sumItems(div.items);
        const open = !isCollapsed(div.code) || !!search;
        return (
          <Fragment key={div.code}>
            <tr onClick={() => toggleDiv(div.code)} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors group">
              <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.02)] group-hover:bg-[rgba(255,255,255,0.03)] transition-colors py-3 px-4">
                <div className="flex items-center gap-2">
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
                    <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                  </motion.span>
                  <span className="font-semibold text-white text-[13px]">{div.code} — {div.name}</span>
                </div>
              </td>
              {activeCols.map((c) => (
                <td key={c.key} className="py-3 px-4 text-right text-[13px]"><Cell col={c} val={tot[c.key]} bold={c.bold} /></td>
              ))}
              <td />
            </tr>
            {open && div.items.map((item) => (
              <tr key={item.id || item.code} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
                <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.02)] group-hover:bg-[rgba(255,255,255,0.02)] transition-colors py-2.5 px-4">
                  <div className="flex items-center gap-2 pl-7">
                    <span className="text-xs text-white/40 shrink-0">{item.code} -</span>
                    <span className="text-xs text-white">{item.description}</span>
                  </div>
                </td>
                {activeCols.map((c) => (
                  <td key={c.key} className="py-2.5 px-4 text-right text-xs"><Cell col={c} val={item[c.key]} /></td>
                ))}
                <ItemActions item={item} />
              </tr>
            ))}
            {open && (
              <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)]">
                <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.025)] py-2 px-4">
                  <span className="text-xs font-semibold text-white/40 pl-7">Subtotal {div.code} - {div.name}</span>
                </td>
                {activeCols.map((c) => (
                  <td key={c.key} className="py-2 px-4 text-right text-xs">
                    <span className={`font-semibold ${c.hColor}`}>{fmtCurrency(tot[c.key])}</span>
                  </td>
                ))}
                <td />
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );

  const CostCodeBody = () => (
    <>
      {flatItems.map((item) => (
        <tr key={item.id || `${item.divCode}-${item.code}`} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
          <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.02)] group-hover:bg-[rgba(255,255,255,0.02)] transition-colors py-2.5 px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-400 shrink-0 w-14">{item.code}</span>
              <span className="text-xs text-white">{item.description}</span>
              <span className="text-[10px] text-white/35 ml-1">{item.divCode} · {item.divName}</span>
            </div>
          </td>
          {activeCols.map((c) => (
            <td key={c.key} className="py-2.5 px-4 text-right text-xs"><Cell col={c} val={item[c.key]} /></td>
          ))}
          <ItemActions item={item} />
        </tr>
      ))}
    </>
  );

  const ProjectBody = () => (
    <>
      {projects.map((proj) => {
        const divs = applySnapshot(proj.divisions, snapshot);
        const tot  = sumDivisions(divs);
        const pct  = tot.revisedBudget > 0 ? ((tot.committedCosts / tot.revisedBudget) * 100).toFixed(1) : "0.0";
        return (
          <tr key={proj.id} className="border-b border-[rgba(255,255,255,0.035)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer" onClick={() => setSelectedPid(proj.id)}>
            <td className="sticky left-0 z-10 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.02)] transition-colors py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{proj.name}</p>
                  <p className="text-xs text-white/40">
                    {pct}% committed
                    {!proj.hasRealItems && <span className="ml-1 text-amber-400">(estimated)</span>}
                    {" · click to drill in"}
                  </p>
                </div>
              </div>
            </td>
            {activeCols.map((c) => (
              <td key={c.key} className="py-3 px-4 text-right text-[13px]"><Cell col={c} val={tot[c.key]} bold={c.bold} /></td>
            ))}
          </tr>
        );
      })}
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      <ModuleTabs tabs={PROJECT_TABS} />

      <AnimatePresence>
        {showImport && (
          <ImportModal projects={projects} onClose={() => setShowImport(false)} onSuccess={handleDataChanged} />
        )}
        {showValidate && (
          <ValidateModal onClose={() => setShowValidate(false)} />
        )}
        {showSync && (
          <SyncModal projects={projects} onClose={() => setShowSync(false)} onSuccess={handleDataChanged} />
        )}
        {showItemForm && (
          <ItemFormModal
            projectId={selectedPid}
            item={editingItem}
            onClose={() => { setShowItemForm(false); setEditingItem(null); }}
            onSuccess={handleDataChanged}
          />
        )}
        {showBudgetSync && selectedPid !== "all" && (
          <BudgetSyncModal
            projectId={selectedPid}
            onClose={() => setShowBudgetSync(false)}
            onSuccess={handleDataChanged}
          />
        )}
        {confirmDeleteItem && (
          <DeleteItemModal
            item={confirmDeleteItem}
            deleting={deletingItemId === confirmDeleteItem.id}
            onClose={() => setConfirmDeleteItem(null)}
            onConfirm={handleDeleteItem}
          />
        )}
        {showDeleteAll && selectedProject && (
          <DeleteAllModal
            projectName={selectedProject.name}
            itemCount={realItemsForSelected.length}
            itemTotal={realItemsForSelected.reduce((s, i) => s + i.originalBudget, 0)}
            deleting={deletingAll}
            onClose={() => setShowDeleteAll(false)}
            onConfirm={handleDeleteAll}
          />
        )}
        {showDeleteAllHistory && selectedProject && (
          <DeleteAllHistoryModal
            projectName={selectedProject.name}
            entryCount={historyForSelected.length}
            deleting={deletingAllHistory}
            onClose={() => setShowDeleteAllHistory(false)}
            onConfirm={handleDeleteAllHistory}
          />
        )}
      </AnimatePresence>

      <div className="space-y-5 pt-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Financial Budget</h1>
            <p className="text-white/35 text-[13px] mt-1">
              CSI division breakdown · budget vs committed vs direct costs
              {selectedProject && <span className="ml-2 text-cyan-400 font-medium">— {selectedProject.name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button style={glassButtonStyle} variant="outline" size="sm" onClick={fetchData} className="border-[rgba(255,255,255,0.07)]">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)}
              className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 max-w-45 h-9">
              <option value="all">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button style={glassButtonStyle} variant="outline" size="sm" className="border-[rgba(255,255,255,0.07)]" onClick={() => setShowSync(true)}>
              <Link2 className="w-4 h-4 mr-2" />Sync Modules
            </Button>
            <Button style={glassButtonStyle} variant="outline" size="sm" className="border-[rgba(255,255,255,0.07)]" onClick={() => setShowValidate(true)}>
              <ShieldCheck className="w-4 h-4 mr-2 text-cyan-400" />Validate File
            </Button>
            <Button style={gradientButtonStyle} className="gradient-blue text-white border-0" size="sm" onClick={() => setShowImport(true)}>
              <Download className="w-4 h-4 mr-2" />Import
            </Button>
            <Button style={gradientButtonStyle} className="gradient-blue text-white border-0" onClick={handleExport}>
              <Upload className="w-4 h-4 mr-2" />Export CSV
            </Button>
          </div>
        </motion.div>

        {/* Fallback / no-data notice */}
        {usingFallback && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400 flex-wrap">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>No imported budget data — showing CSI-proportional estimates based on project budgets.</span>
            <button onClick={() => setShowImport(true)} className="underline hover:text-amber-300">Import a file</button>
            <span className="text-white/40">·</span>
            <button onClick={() => setShowSync(true)} className="underline hover:text-amber-300">or sync from Cost Codes</button>
          </motion.div>
        )}

        {/* Cost codes available hint */}
        {!loading && liveActuals && liveActuals.cost_codes_count > 0 && usingFallback && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-500/5 border border-teal-500/20 text-xs text-teal-400 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{liveActuals.cost_codes_count} cost codes found in the Construction module — import them as budget line items.</span>
            <button onClick={() => setShowSync(true)} className="underline hover:text-teal-300">Sync now</button>
          </motion.div>
        )}

        {/* Itemized budget vs. canonical project budget discrepancy */}
        {!loading && selectedPid !== "all" && liveActuals && liveActuals.has_financial_items && !liveActuals.in_sync && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400 flex-wrap">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Line items total {fmtMoney(liveActuals.financial_items_total)}, but the project budget is {fmtMoney(liveActuals.project_budget)}
              {" "}({liveActuals.discrepancy_pct.toFixed(1)}% difference).
            </span>
            <button onClick={() => setShowBudgetSync(true)} className="underline hover:text-amber-300">Review & Sync</button>
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: kpi.accent.border }}>
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${kpi.accent.bg}, transparent 70%)` }} />
              <div className="relative flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: kpi.accent.bg, border: `1px solid ${kpi.accent.border}`, boxShadow: `0 0 16px ${kpi.accent.shadow}` }}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.accent.text }} />
                </div>
                <p className="text-[13px] text-white/40">{kpi.label}</p>
              </div>
              <p className="relative text-2xl font-bold" style={{ color: kpi.accent.text }}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/40 inline" /> : kpi.value}
              </p>
              <p className="relative text-[11px] text-white/35 mt-1">{kpi.sub}</p>
              {kpi.trendData.length >= 2 && (
                <div className="relative -mx-1 mt-2 opacity-70">
                  <Sparkline data={kpi.trendData} color={kpi.accent.text} type={kpi.trendType} labels={kpi.trendLabels} valueFormatter={kpi.trendFmt} />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Budget Distribution */}
        <BudgetDistributionCard />

        {/* Connected Modules */}
        <ConnectedModulesPanel />

        {/* Main card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.07)] rounded-2xl overflow-hidden">
          {/* Budget / Change History tabs */}
          <div className="flex items-center border-b border-[rgba(255,255,255,0.07)] px-4 gap-1">
            {([
              { id: "budget",  label: "Budget",         Icon: FileSpreadsheet },
              { id: "history", label: "Change History", Icon: History },
            ] as { id: "budget"|"history"; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === id ? "border-cyan-500 text-cyan-400" : "border-transparent text-white/40 hover:text-white"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* ── BUDGET TAB ── */}
          {activeTab === "budget" && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-white/40">View</span>
                  <select value={view} onChange={(e) => setView(e.target.value as ViewMode)}
                    className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="standard">All Columns</option>
                    <option value="committed">Committed Costs</option>
                    <option value="direct">Direct Costs Only</option>
                  </select>
                </label>
                <div className="w-px h-4 bg-[rgba(255,255,255,0.08)]" />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-white/40">Snapshot</span>
                  <select value={snapshot} onChange={(e) => setSnapshot(e.target.value as SnapshotMode)}
                    className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="current">Current</option>
                    <option value="original">Original (no COs)</option>
                    <option value="last-month">Last Month</option>
                  </select>
                </label>
                <div className="w-px h-4 bg-[rgba(255,255,255,0.08)]" />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-white/40">Group By</span>
                  <select value={group} onChange={(e) => setGroup(e.target.value as GroupMode)}
                    className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="division">Division</option>
                    <option value="cost-code">Cost Code (Flat List)</option>
                    <option value="project">Project</option>
                  </select>
                </label>
                <div className="flex-1" />
                {snapshot !== "current" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {snapshot === "original" ? "Viewing: Original" : "Viewing: Last Month"}
                  </span>
                )}
                <button
                  onClick={openAddItem}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />Add Item
                </button>
                <button
                  onClick={() => {
                    if (selectedPid === "all") { toast.error("Select a specific project first"); return; }
                    if (realItemsForSelected.length === 0) { toast.error("No real line items to delete for this project — it's showing the CSI estimate"); return; }
                    setShowDeleteAll(true);
                  }}
                  title="Delete all line items for this project"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />Delete All
                </button>
                <div className="flex items-center gap-1.5 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1">
                  <Filter className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add Filter"
                    className="text-xs bg-transparent outline-none text-white placeholder:text-white/40 w-24" />
                  {search && <button onClick={() => setSearch("")} className="text-white/40 hover:text-white leading-none">×</button>}
                </div>
                {group === "division" && (
                  <>
                    <div className="w-px h-4 bg-[rgba(255,255,255,0.08)]" />
                    <div className="flex items-center gap-2 text-xs">
                      <button onClick={expandAll}   className="text-blue-400 hover:text-blue-300 transition-colors">Expand All</button>
                      <span className="text-white/40">|</span>
                      <button onClick={collapseAll} className="text-blue-400 hover:text-blue-300 transition-colors">Collapse All</button>
                    </div>
                  </>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : usingFallback ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/40 px-6">
                  <PlusCircle className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium text-white/60">No budget line items yet</p>
                  <p className="text-xs text-center max-w-sm">
                    Budget line items live in the <strong>financial_budget_items</strong> table.
                    Add items manually, import a file, or sync from your Construction cost codes.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap justify-center">
                    <button onClick={openAddItem} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                      <Plus className="w-3.5 h-3.5" />Add Line Item
                    </button>
                    <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.08)] transition-colors text-white">
                      <Download className="w-3.5 h-3.5" />Import File
                    </button>
                    <button onClick={() => setShowSync(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 transition-colors">
                      <Link2 className="w-3.5 h-3.5" />Sync from Modules
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm" style={{ minWidth: view === "direct" ? 500 : 900 }}>
                    <TableHead />
                    <tbody>
                      {group === "division"  && <DivisionBody divs={filteredDivisions} />}
                      {group === "cost-code" && <CostCodeBody />}
                      {group === "project"   && selectedPid === "all" ? <ProjectBody /> : <DivisionBody divs={filteredDivisions} />}
                      <GrandTotalRow totals={grand} />
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── CHANGE HISTORY TAB ── */}
          {activeTab === "history" && (
            <div className="p-5 space-y-3">
              {!loading && historyForSelected.length > 0 && (
                <div className="flex justify-end mb-1">
                  <button
                    onClick={() => {
                      if (selectedPid === "all") { toast.error("Select a specific project first"); return; }
                      setShowDeleteAllHistory(true);
                    }}
                    title="Delete all change history entries for this project"
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />Delete All
                  </button>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                </div>
              ) : historyForSelected.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/40">
                  <History className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No change history yet — import a budget file to begin tracking</p>
                </div>
              ) : (
                historyForSelected.map((entry, i) => (
                  <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-4 p-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.045)] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                      <ReceiptText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-white">{entry.field}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{entry.division}</span>
                      </div>
                      <p className="text-xs text-white/40">{entry.reason}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className={`text-sm font-semibold ${entry.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {entry.delta >= 0 ? "+" : ""}{fmtCurrency(entry.delta)}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-xs text-white/40">
                        <Clock className="w-3 h-3" /><span>{entry.date}</span>
                      </div>
                      <p className="text-xs text-white/40">{entry.user_name}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </motion.div>

        <ModuleChat
          context="Financial Budget"
          placeholder="Ask about budget line items, cost codes, variances..."
          pageSummaryData={{
            originalBudget:  fmtMoney(grand.originalBudget),
            approvedCOs:     fmtMoney(grand.approvedCOs),
            revisedBudget:   fmtMoney(grand.revisedBudget),
            committedCosts:  fmtMoney(grand.committedCosts),
            directCosts:     fmtMoney(grand.directCosts),
            viewMode:        view,
            snapshotMode:    snapshot,
            groupMode:       group,
            selectedProject: selectedProject?.name ?? "All Projects",
            dataSource:      usingFallback ? "CSI proportional estimate" : "imported budget data",
          }}
        />
      </div>
    </div>
  );
}
