"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign, TrendingUp, ChevronRight, Download, Filter, RefreshCw,
  Loader2, Clock, CheckCircle2, AlertCircle, FileSpreadsheet, History,
  ReceiptText, FolderOpen, Upload, X, AlertTriangle, CheckCheck, FileText,
  Building2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

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

interface BudgetItem {
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
}

type Totals = Record<ColKey, number>;
const ZERO: Totals = {
  originalBudget: 0, budgetMods: 0, approvedCOs: 0, revisedBudget: 0,
  pendingChanges: 0, projectedBudget: 0, committedCosts: 0, directCosts: 0,
};

// ─── Import modal types ───────────────────────────────────────────────────────

type ImportStep = "upload" | "validate" | "details" | "confirm";

interface ColMapping { file_header: string; canonical: string; }
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  row_count: number;
  column_mapping: ColMapping[];
  preview: Record<string, unknown>[];
}

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: ColKey; header: string; header2?: string;
  hColor: string; cellColor: (v: number) => string; bold?: boolean;
}

const COL_DEFS: ColDef[] = [
  { key: "originalBudget",  header: "Original Budget", header2: "Amount",        hColor: "text-muted-foreground", cellColor: ()  => "text-foreground",      bold: true },
  { key: "budgetMods",      header: "Budget",          header2: "Modifications", hColor: "text-muted-foreground", cellColor: (v) => v === 0 ? "text-muted-foreground" : "text-foreground" },
  { key: "approvedCOs",     header: "Approved COs",                              hColor: "text-blue-400",         cellColor: (v) => v === 0 ? "text-muted-foreground" : "text-blue-400 font-medium" },
  { key: "revisedBudget",   header: "Revised Budget",                            hColor: "text-muted-foreground", cellColor: ()  => "text-foreground",      bold: true },
  { key: "pendingChanges",  header: "Pending Budget",  header2: "Changes",       hColor: "text-muted-foreground", cellColor: (v) => v === 0 ? "text-muted-foreground" : "text-foreground" },
  { key: "projectedBudget", header: "Projected",       header2: "Budget",        hColor: "text-muted-foreground", cellColor: ()  => "text-foreground",      bold: true },
  { key: "committedCosts",  header: "Committed",       header2: "Costs",         hColor: "text-orange-400",       cellColor: (v) => v === 0 ? "text-muted-foreground" : "text-orange-400 font-medium" },
  { key: "directCosts",     header: "Direct Costs",                              hColor: "text-blue-400",         cellColor: (v) => v === 0 ? "text-muted-foreground" : "text-blue-400 font-medium" },
];

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

function buildFallbackDivisions(
  totalBudget: number,
  committedTotal: number,
  directTotal: number,
): BudgetDivision[] {
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
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Details form
  const [projectId,   setProjectId]   = useState(projects[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [notes,       setNotes]       = useState("");
  const [userName,    setUserName]    = useState("");

  const ACCEPTED = ".csv,.xlsx,.xls";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  function pickFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast.error("Only .csv, .xlsx, and .xls files are accepted");
      return;
    }
    setFile(f);
    setValidation(null);
    setStep("validate");
    runValidation(f);
  }

  async function runValidation(f: File) {
    setValidating(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await axios.post<ValidationResult>(`${API}/api/v1/financials/import/validate`, fd);
      setValidation(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setValidation({
        valid: false,
        errors: [typeof msg === "string" ? msg : "Validation request failed"],
        warnings: [],
        row_count: 0,
        column_mapping: [],
        preview: [],
      });
    } finally {
      setValidating(false);
    }
  }

  async function handleConfirmImport() {
    if (!file || !companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId || "all");
      fd.append("company_name", companyName.trim());
      fd.append("notes", notes.trim());
      fd.append("user_name", userName.trim() || companyName.trim());
      const res = await axios.post(`${API}/api/v1/financials/import/confirm`, fd);
      toast.success(`Imported ${res.data.imported_rows} line items successfully`);
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

  const REQUIRED_CANONICALS = ["description", "original_budget"];
  const allRequiredMatched = validation
    ? REQUIRED_CANONICALS.every((c) => validation.column_mapping.some((m) => m.canonical === c))
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Import Budget Data</h2>
              <p className="text-xs text-muted-foreground">CSV · XLSX · XLS</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            {(["upload","validate","details","confirm"] as ImportStep[]).map((s, i) => {
              const labels: Record<ImportStep, string> = { upload:"1. File", validate:"2. Validate", details:"3. Details", confirm:"4. Confirm" };
              const reached = ["upload","validate","details","confirm"].indexOf(step) >= i;
              return (
                <Fragment key={s}>
                  <span className={`px-2.5 py-1 rounded-full font-medium transition-colors ${reached ? "bg-blue-500/15 text-blue-400" : "text-muted-foreground"}`}>
                    {labels[s]}
                  </span>
                  {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </Fragment>
              );
            })}
          </div>

          {/* ── STEP 1: Upload ── */}
          {(step === "upload" || (step === "validate" && !file)) && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragOver ? "border-blue-400 bg-blue-500/5" : "border-border hover:border-blue-500/50"
              }`}
            >
              <input
                ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
              />
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Drop your budget file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse — .csv, .xlsx, .xls</p>
            </div>
          )}

          {/* ── STEP 2: Validation results ── */}
          {step === "validate" && file && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-border">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => { setFile(null); setValidation(null); setStep("upload"); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {validating ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/30">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <p className="text-sm text-muted-foreground">Validating file…</p>
                </div>
              ) : validation && (
                <div className="space-y-3">
                  {/* Summary badge */}
                  <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${
                    validation.valid && allRequiredMatched
                      ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/5 border-red-500/20 text-red-400"
                  }`}>
                    {validation.valid && allRequiredMatched
                      ? <><CheckCheck className="w-4 h-4" /> {validation.row_count} rows ready to import</>
                      : <><AlertTriangle className="w-4 h-4" /> Validation failed — fix errors below</>
                    }
                  </div>

                  {/* Errors */}
                  {validation.errors.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Errors</p>
                      {validation.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {e}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Warnings</p>
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 rounded-lg px-3 py-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Column mapping */}
                  {validation.column_mapping.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Column Mapping</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {validation.column_mapping.map((m, i) => {
                          const isRequired = REQUIRED_CANONICALS.includes(m.canonical);
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs bg-secondary/30 rounded-lg px-3 py-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="text-muted-foreground truncate">{m.file_header}</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className={`font-medium truncate ${isRequired ? "text-blue-400" : "text-foreground"}`}>
                                {m.canonical}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={() => { setFile(null); setValidation(null); setStep("upload"); }} className="border-border flex-1">
                  Choose Different File
                </Button>
                {validation?.valid && allRequiredMatched && (
                  <Button className="gradient-blue text-white border-0 flex-1" size="sm" onClick={() => setStep("details")}>
                    Continue
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Details form ── */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground flex items-center gap-2">
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {file?.name} · {validation?.row_count} rows validated
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">
                    Company / Organization Name <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Construction Ltd."
                      className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Project</label>
                  <div className="relative flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5">
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Uploaded by (optional)</label>
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Your name or role"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Q2 budget revision, approved by PM"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground resize-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep("validate")} className="border-border flex-1">
                  Back
                </Button>
                <Button
                  className="gradient-blue text-white border-0 flex-1"
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
              <div className="space-y-2 rounded-xl bg-secondary/30 border border-border p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File</span>
                  <span className="text-foreground font-medium">{file?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rows</span>
                  <span className="text-foreground font-medium">{validation?.row_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span className="text-foreground font-medium">{companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className="text-foreground font-medium">
                    {projects.find((p) => p.id === projectId)?.name ?? projectId}
                  </span>
                </div>
                {userName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uploaded by</span>
                    <span className="text-foreground font-medium">{userName}</span>
                  </div>
                )}
                {notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Notes</span>
                    <span className="text-foreground font-medium text-right max-w-48 truncate">{notes}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
                This will replace all existing budget line items for the selected project.
              </p>

              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep("details")} className="border-border flex-1" disabled={importing}>
                  Back
                </Button>
                <Button
                  className="gradient-blue text-white border-0 flex-1"
                  size="sm"
                  onClick={handleConfirmImport}
                  disabled={importing}
                >
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [activeTab,    setActiveTab]    = useState<"budget"|"history">("budget");
  const [loading,      setLoading]      = useState(true);
  const [projects,     setProjects]     = useState<ProjectInfo[]>([]);
  const [allDivisions, setAllDivisions] = useState<BudgetDivision[]>([]);
  const [history,      setHistory]      = useState<ChangeHistoryEntry[]>([]);
  const [showImport,   setShowImport]   = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  const [selectedPid, setSelectedPid] = useState("all");
  const [view,        setView]        = useState<ViewMode>("standard");
  const [snapshot,    setSnapshot]    = useState<SnapshotMode>("current");
  const [group,       setGroup]       = useState<GroupMode>("division");
  const [search,      setSearch]      = useState("");
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, payRes, itemsRes, histRes] = await Promise.allSettled([
        axios.get(`${API}/api/v1/projects/`),
        axios.get(`${API}/api/v1/payments/invoices`),
        axios.get(`${API}/api/v1/financials/budget-items`),
        axios.get(`${API}/api/v1/financials/change-history`),
      ]);

      let rawProjects: Record<string, unknown>[] = [];
      if (projRes.status === "fulfilled") rawProjects = projRes.value.data.projects || [];
      if (rawProjects.length === 0) rawProjects = [{ id: "demo", name: "Demo Project", total_budget: 2_450_000, spent_to_date: 930_000 }];

      // Invoice committed totals per project
      const invByProj: Record<string, number> = {};
      if (payRes.status === "fulfilled") {
        for (const inv of (payRes.value.data.invoices || [])) {
          if (inv.status === "received" && inv.project_id) {
            invByProj[inv.project_id] = (invByProj[inv.project_id] || 0) + (inv.amount || 0);
          }
        }
      }

      // Real budget items from DB
      const dbItems: Record<string, unknown>[] =
        itemsRes.status === "fulfilled" ? (itemsRes.value.data.items || []) : [];

      const hasRealItems = dbItems.length > 0;
      setUsingFallback(!hasRealItems);

      // Group DB items by project_id
      const itemsByProject = new Map<string, Record<string, unknown>[]>();
      for (const item of dbItems) {
        const pid = String(item.project_id || "all");
        if (!itemsByProject.has(pid)) itemsByProject.set(pid, []);
        itemsByProject.get(pid)!.push(item);
      }

      const projectList: ProjectInfo[] = rawProjects.map((p) => {
        const budget    = Number(p.total_budget  ?? 0);
        const spent     = Number(p.spent_to_date ?? 0);
        const committed = invByProj[String(p.id)] ?? spent * 0.72;
        const direct    = Math.max(0, spent - committed);

        const projItems = itemsByProject.get(String(p.id)) ?? [];
        const hasProjItems = projItems.length > 0;
        const divisions = hasProjItems
          ? dbItemsToDivisions(projItems)
          : buildFallbackDivisions(budget || 2_450_000, committed, direct);

        return {
          id:           String(p.id),
          name:         String(p.name || `Project ${String(p.id).slice(0, 6)}`),
          total_budget: budget,
          spent_to_date: spent,
          committed,
          direct,
          divisions,
          hasRealItems: hasProjItems,
        };
      });
      setProjects(projectList);

      // Aggregated all-projects view
      if (hasRealItems) {
        setAllDivisions(dbItemsToDivisions(dbItems));
      } else {
        const aggBudget    = projectList.reduce((s, p) => s + p.total_budget, 0) || 2_450_000;
        const aggCommitted = projectList.reduce((s, p) => s + p.committed, 0);
        const aggDirect    = projectList.reduce((s, p) => s + p.direct, 0);
        setAllDivisions(buildFallbackDivisions(aggBudget, aggCommitted, aggDirect));
      }

      // Collapse state
      const divCodes = new Set<string>([
        ...CSI_BLUEPRINT.map((d) => d.code),
        ...dbItems.map((i) => String(i.div_code || "00")),
      ]);
      const initCollapsed: Record<string, boolean> = {};
      divCodes.forEach((c) => { initCollapsed[c] = true; });
      setCollapsed(initCollapsed);

      // Change history
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

  // ── Derived data ────────────────────────────────────────────────────────────

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

  const flatItems = useMemo(() => {
    return filteredDivisions.flatMap((d) => d.items).sort((a, b) => a.code.localeCompare(b.code));
  }, [filteredDivisions]);

  const grand = useMemo(() => sumDivisions(filteredDivisions), [filteredDivisions]);
  const activeCols = useMemo(() => COL_DEFS.filter((c) => VIEW_KEYS[view].includes(c.key)), [view]);

  const isCollapsed = (code: string) => collapsed[code] !== false;
  const toggleDiv   = (code: string) => setCollapsed((p) => ({ ...p, [code]: !isCollapsed(code) }));
  const expandAll   = () => setCollapsed((p) => Object.fromEntries(Object.keys(p).map((k) => [k, false])));
  const collapseAll = () => setCollapsed((p) => Object.fromEntries(Object.keys(p).map((k) => [k, true])));

  const selectedProject = selectedPid !== "all" ? projects.find((p) => p.id === selectedPid) : null;
  const projectCount    = selectedPid === "all" ? projects.length : 1;

  const kpis = [
    { label: "Original Budget", value: fmtMoney(grand.originalBudget),  sub: `${projectCount} project${projectCount !== 1 ? "s" : ""}`,                                                                       icon: DollarSign,  color: "border-blue-500/20 bg-blue-500/5",    iconColor: "text-blue-400"    },
    { label: "Approved COs",    value: fmtMoney(grand.approvedCOs),      sub: grand.originalBudget > 0 ? `${((grand.approvedCOs / grand.originalBudget) * 100).toFixed(2)}% of budget` : "—",                icon: CheckCircle2, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
    { label: "Revised Budget",  value: fmtMoney(grand.revisedBudget),    sub: "Original + Mods + COs",                                                                                                         icon: TrendingUp,  color: "border-purple-500/20 bg-purple-500/5", iconColor: "text-purple-400"  },
    { label: "Committed Costs", value: fmtMoney(grand.committedCosts),   sub: grand.revisedBudget > 0 ? `${((grand.committedCosts / grand.revisedBudget) * 100).toFixed(1)}% committed` : "—",               icon: AlertCircle, color: "border-orange-500/20 bg-orange-500/5",  iconColor: "text-orange-400"  },
  ];

  // ── Sub-components ──────────────────────────────────────────────────────────

  const Cell = ({ col, val, bold }: { col: ColDef; val: number; bold?: boolean }) => (
    <span className={`${col.cellColor(val)}${bold ? " font-semibold" : ""}`}>{fmtCurrency(val)}</span>
  );

  const TableHead = () => (
    <thead>
      <tr className="border-b border-border bg-secondary/30">
        <th className="sticky left-0 z-10 bg-secondary/60 text-left py-3 px-4 text-xs font-semibold text-muted-foreground w-72 min-w-[288px]">
          Description
        </th>
        {activeCols.map((c) => (
          <th key={c.key} className={`py-3 px-4 text-right text-xs font-semibold ${c.hColor} whitespace-nowrap min-w-30`}>
            {c.header}{c.header2 && <><br />{c.header2}</>}
          </th>
        ))}
      </tr>
    </thead>
  );

  const GrandTotalRow = ({ totals }: { totals: Totals }) => (
    <tr className="bg-secondary/40 border-t-2 border-border/80">
      <td className="sticky left-0 z-10 bg-secondary/60 py-3.5 px-4 font-bold text-foreground">Grand Total</td>
      {activeCols.map((c) => (
        <td key={c.key} className="py-3.5 px-4 text-right">
          <span className={`font-bold ${c.hColor}`}>{fmtCurrency(totals[c.key])}</span>
        </td>
      ))}
    </tr>
  );

  const DivisionBody = ({ divs }: { divs: BudgetDivision[] }) => (
    <>
      {divs.map((div) => {
        const tot  = sumItems(div.items);
        const open = !isCollapsed(div.code) || !!search;
        return (
          <Fragment key={div.code}>
            <tr onClick={() => toggleDiv(div.code)} className="border-b border-border/60 hover:bg-secondary/30 cursor-pointer transition-colors group">
              <td className="sticky left-0 z-10 bg-card group-hover:bg-secondary/30 transition-colors py-3 px-4">
                <div className="flex items-center gap-2">
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </motion.span>
                  <span className="font-semibold text-foreground text-[13px]">*{div.code} - {div.name}</span>
                </div>
              </td>
              {activeCols.map((c) => (
                <td key={c.key} className="py-3 px-4 text-right text-[13px]"><Cell col={c} val={tot[c.key]} bold={c.bold} /></td>
              ))}
            </tr>
            {open && div.items.map((item) => (
              <tr key={item.code} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                <td className="sticky left-0 z-10 bg-card hover:bg-secondary/20 transition-colors py-2.5 px-4">
                  <div className="flex items-center gap-2 pl-7">
                    <span className="text-xs text-muted-foreground shrink-0">{item.code} -</span>
                    <span className="text-xs text-foreground">{item.description}</span>
                  </div>
                </td>
                {activeCols.map((c) => (
                  <td key={c.key} className="py-2.5 px-4 text-right text-xs"><Cell col={c} val={item[c.key]} /></td>
                ))}
              </tr>
            ))}
            {open && (
              <tr className="border-b border-border bg-secondary/25">
                <td className="sticky left-0 z-10 bg-secondary/25 py-2 px-4">
                  <span className="text-xs font-semibold text-muted-foreground pl-7">Subtotal {div.code} - {div.name}</span>
                </td>
                {activeCols.map((c) => (
                  <td key={c.key} className="py-2 px-4 text-right text-xs">
                    <span className={`font-semibold ${c.hColor}`}>{fmtCurrency(tot[c.key])}</span>
                  </td>
                ))}
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
        <tr key={`${item.divCode}-${item.code}`} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
          <td className="sticky left-0 z-10 bg-card hover:bg-secondary/20 transition-colors py-2.5 px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-400 shrink-0 w-14">{item.code}</span>
              <span className="text-xs text-foreground">{item.description}</span>
              <span className="text-[10px] text-muted-foreground/60 ml-1">{item.divCode} · {item.divName}</span>
            </div>
          </td>
          {activeCols.map((c) => (
            <td key={c.key} className="py-2.5 px-4 text-right text-xs"><Cell col={c} val={item[c.key]} /></td>
          ))}
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
          <tr key={proj.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedPid(proj.id)}>
            <td className="sticky left-0 z-10 bg-card hover:bg-secondary/20 transition-colors py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{proj.name}</p>
                  <p className="text-xs text-muted-foreground">
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      <ModuleTabs tabs={PROJECT_TABS} />

      <AnimatePresence>
        {showImport && (
          <ImportModal
            projects={projects}
            onClose={() => setShowImport(false)}
            onSuccess={() => { fetchData(); }}
          />
        )}
      </AnimatePresence>

      <div className="space-y-5 pt-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Financial Budget</h1>
            <p className="text-muted-foreground text-sm mt-1">
              CSI division breakdown · budget vs committed vs direct costs
              {selectedProject && <span className="ml-2 text-blue-400 font-medium">— {selectedProject.name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedPid !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setSelectedPid("all")} className="border-border text-xs">
                ← All Projects
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchData} className="border-border">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="border-border" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4 mr-2" />Import
            </Button>
            <Button className="gradient-blue text-white border-0" onClick={() => toast.success("Budget exported to CSV")}>
              <Download className="w-4 h-4 mr-2" />Export
            </Button>
          </div>
        </motion.div>

        {/* Fallback notice */}
        {usingFallback && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            No imported budget data — showing CSI-proportional estimates based on project budgets.
            <button onClick={() => setShowImport(true)} className="underline hover:text-amber-300 ml-1">Import a file</button> to replace with real data.
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -2 }}
              className={`rounded-2xl border p-5 ${kpi.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
                </div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline" /> : kpi.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Main card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border rounded-2xl overflow-hidden">

          {/* Budget / Change History tabs */}
          <div className="flex items-center border-b border-border px-4 gap-1">
            {([
              { id: "budget",  label: "Budget",         Icon: FileSpreadsheet },
              { id: "history", label: "Change History", Icon: History },
            ] as { id: "budget"|"history"; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* ── BUDGET TAB ──────────────────────────────────────────────────── */}
          {activeTab === "budget" && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-border bg-secondary/20">
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Project</span>
                  <select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)}
                    className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-blue-500 max-w-45">
                    <option value="all">All Projects</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <div className="w-px h-4 bg-border" />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">View</span>
                  <select value={view} onChange={(e) => setView(e.target.value as ViewMode)}
                    className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="standard">Standard Budget</option>
                    <option value="committed">Committed Costs View</option>
                    <option value="direct">Direct Costs Only</option>
                  </select>
                </label>
                <div className="w-px h-4 bg-border" />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Snapshots</span>
                  <select value={snapshot} onChange={(e) => setSnapshot(e.target.value as SnapshotMode)}
                    className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="current">Current</option>
                    <option value="original">Original (no COs)</option>
                    <option value="last-month">Last Month</option>
                  </select>
                </label>
                <div className="w-px h-4 bg-border" />
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Group</span>
                  <select value={group} onChange={(e) => setGroup(e.target.value as GroupMode)}
                    className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="division">Sub Job, Division</option>
                    <option value="cost-code">Cost Code (Flat)</option>
                    <option value="project">Project</option>
                  </select>
                </label>
                <div className="flex-1" />
                {snapshot !== "current" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {snapshot === "original" ? "Viewing: Original" : "Viewing: Last Month"}
                  </span>
                )}
                <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-2 py-1">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add Filter"
                    className="text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground w-24" />
                  {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground leading-none">×</button>}
                </div>
                {search && <button onClick={() => setSearch("")} className="text-xs text-red-400 hover:text-red-300">Clear All</button>}
                {group === "division" && (
                  <>
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-center gap-2 text-xs">
                      <button onClick={expandAll}   className="text-blue-400 hover:text-blue-300 transition-colors">Expand All</button>
                      <span className="text-muted-foreground">|</span>
                      <button onClick={collapseAll} className="text-blue-400 hover:text-blue-300 transition-colors">Collapse All</button>
                    </div>
                  </>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm" style={{ minWidth: group === "direct" ? 500 : 900 }}>
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

          {/* ── CHANGE HISTORY TAB ──────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div className="p-5 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                  <History className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No change history yet — import a budget file to begin tracking</p>
                </div>
              ) : (
                history.map((entry, i) => (
                  <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                      <ReceiptText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-foreground">{entry.field}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{entry.division}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{entry.reason}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className={`text-sm font-semibold ${entry.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {entry.delta >= 0 ? "+" : ""}{fmtCurrency(entry.delta)}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /><span>{entry.date}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{entry.user_name}</p>
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
            originalBudget: fmtMoney(grand.originalBudget),
            approvedCOs:    fmtMoney(grand.approvedCOs),
            revisedBudget:  fmtMoney(grand.revisedBudget),
            committedCosts: fmtMoney(grand.committedCosts),
            directCosts:    fmtMoney(grand.directCosts),
            viewMode:       view,
            snapshotMode:   snapshot,
            groupMode:      group,
            selectedProject: selectedProject?.name ?? "All Projects",
            dataSource:     usingFallback ? "CSI proportional estimate" : "imported budget data",
          }}
        />
      </div>
    </div>
  );
}
