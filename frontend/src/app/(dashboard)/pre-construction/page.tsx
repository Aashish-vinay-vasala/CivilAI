"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HardHat, FileSearch, ClipboardList, CheckSquare,
  Scale, BookOpen, Calculator, FolderOpen, Upload,
  AlertTriangle, CheckCircle, Circle, ChevronDown,
  ChevronRight, Loader2, FileText, X, Plus, Trash2,
  Save, Download, ChevronDown as CaretDown, FolderOpen as FolderLoad,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTenderStore, Tender } from "@/lib/stores/tenderStore";
import { exportGapCheckPDF } from "@/lib/exportTenderPDF";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`;

/* ── Types ───────────────────────────────────────────────────────────────── */
interface ProjectSummary {
  project_name?: string; client?: string; location?: string;
  project_type?: string; contract_type?: string; estimated_value?: string;
  key_dates?: Record<string, string>;
  scope_summary?: string;
  scope_by_trade?: Record<string, string>;
  site_constraints?: string[]; exclusions?: string[];
  owner_supplied?: string[]; documents?: string[]; key_risks?: string[];
}

interface RequirementItem {
  item: string; detail?: string; source?: string; critical?: boolean; checked?: boolean;
}

interface Requirements { [trade: string]: RequirementItem[] }

interface GapResult {
  covered: { item: string; trade: string }[];
  missing: { item: string; trade: string; risk: string; reason: string }[];
  ambiguous: { item: string; trade: string; note: string }[];
  risk_score: number;
  risk_summary: string;
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */
const sections = [
  {
    label: "TENDER ANALYSIS",
    items: [
      { id: "documents",    icon: FolderOpen,    label: "Document Upload",       ai: true },
      { id: "requirements", icon: ClipboardList, label: "Requirements Register", ai: true },
      { id: "gap-checker",  icon: CheckSquare,   label: "Estimate Gap Checker",  ai: true },
    ],
  },
  {
    label: "BID ASSESSMENT",
    items: [
      { id: "go-no-go",     icon: Scale,      label: "Go / No-Go",          ai: false as const },
      { id: "bid-register", icon: BookOpen,   label: "Bid Register",        ai: false as const },
    ],
  },
  {
    label: "ESTIMATING",
    items: [
      { id: "rates",   icon: Calculator, label: "Rates Database",        ai: false as const },
      { id: "prelims", icon: FileSearch, label: "Prelims Calculator",    ai: false as const },
    ],
  },
];
const allItems = sections.flatMap(s => s.items);

/* ── Streaming helper ────────────────────────────────────────────────────── */
async function streamPost(
  url: string, body: FormData | string, isJson: boolean,
  onToken: (t: string) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: isJson ? { "Content-Type": "application/json" } : undefined,
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") return;
      try { const p = JSON.parse(payload); if (p.token) onToken(p.token); } catch {}
    }
  }
}

/* ── Tender selector bar ─────────────────────────────────────────────────── */
function TenderBar({
  tenders, activeTenderId, onSelect, onNew, onSave, onDelete, hasData, saving,
}: {
  tenders: Tender[]; activeTenderId: string | null;
  onSelect: (t: Tender) => void; onNew: () => void;
  onSave: () => void; onDelete: (id: string) => void;
  hasData: boolean; saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = tenders.find(t => t.id === activeTenderId);

  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/8 bg-white/2 shrink-0">
      <span className="text-white/30 text-xs uppercase tracking-wider mr-1">Tender</span>

      <div className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
          <span className="text-white/70 text-sm">{active?.project_name ?? "Select or create"}</span>
          <CaretDown className="w-3.5 h-3.5 text-white/30" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 mt-1 w-72 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-1">
                <button onClick={() => { onNew(); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-blue-400 text-sm transition-colors">
                  <Plus className="w-3.5 h-3.5" /> New tender
                </button>
              </div>
              {tenders.length > 0 && (
                <div className="border-t border-white/8 p-1 max-h-60 overflow-y-auto">
                  {tenders.map(t => (
                    <div key={t.id} className="flex items-center group">
                      <button onClick={() => { onSelect(t); setOpen(false); }}
                        className={cn("flex-1 flex items-start gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                          t.id === activeTenderId ? "bg-blue-600/15 text-blue-300" : "hover:bg-white/5 text-white/60")}>
                        <FolderLoad className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{t.project_name}</p>
                          <p className="text-[10px] text-white/25">{new Date(t.updated_at).toLocaleDateString()}</p>
                        </div>
                      </button>
                      <button onClick={() => onDelete(t.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-400 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hasData && (
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/25 hover:bg-blue-600/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? "Saving..." : "Save Tender"}
        </button>
      )}

      {active && (
        <span className={cn("ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold border",
          active.status === "won" ? "text-green-400 border-green-500/20 bg-green-500/10"
          : active.status === "lost" || active.status === "no-bid" ? "text-red-400 border-red-500/20 bg-red-500/10"
          : active.status === "submitted" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
          : "text-blue-400 border-blue-500/20 bg-blue-500/10"
        )}>
          {active.status.replace("-", " ").toUpperCase()}
        </span>
      )}
    </div>
  );
}

/* ── Module: Document Upload ─────────────────────────────────────────────── */
function DocumentModule({ onSummary, initialSummary }: {
  onSummary: (s: ProjectSummary) => void;
  initialSummary?: ProjectSummary | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState<ProjectSummary | null>(initialSummary ?? null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (initialSummary) setSummary(initialSummary); }, [initialSummary]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") setFile(f);
  }, []);

  const analyse = async () => {
    if (!file) return;
    setLoading(true); setRaw(""); setSummary(null); setError("");
    const fd = new FormData();
    fd.append("file", file);
    let accumulated = "";
    try {
      await streamPost(`${API}/api/v1/preconstruction/analyse`, fd, false, t => {
        accumulated += t; setRaw(accumulated);
      });
      const json = accumulated.match(/\{[\s\S]*\}/)?.[0] || accumulated;
      const parsed: ProjectSummary = JSON.parse(json);
      setSummary(parsed); onSummary(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to analyse document");
    } finally { setLoading(false); }
  };

  if (summary) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
          <CheckCircle className="w-4 h-4" /> Analysis complete
        </div>
        <button onClick={() => { setFile(null); setSummary(null); setRaw(""); }}
          className="text-white/30 hover:text-white/60 text-xs transition-colors">Upload another</button>
      </div>
      <SummaryDisplay summary={summary} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current?.click()}
        className={cn("border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors",
          file ? "border-blue-500/50 bg-blue-500/5" : "border-white/10 hover:border-white/20 bg-white/2")}>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => setFile(e.target.files?.[0] || null)} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-8 h-8 text-blue-400" />
            <div className="text-left">
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-white/40 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null); }}
              className="ml-4 text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-8 h-8 text-white/20 mx-auto" />
            <p className="text-white/50">Drop tender PDF here or click to browse</p>
            <p className="text-white/25 text-xs">PDF only · Max 50 MB</p>
          </div>
        )}
      </div>
      {file && !loading && (
        <button onClick={analyse}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors flex items-center justify-center gap-2">
          <HardHat className="w-4 h-4" /> Analyse Tender
        </button>
      )}
      {loading && (
        <div className="rounded-2xl border border-white/8 bg-white/2 p-6 space-y-3">
          <div className="flex items-center gap-2 text-blue-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI is reading your tender document...
          </div>
          <pre className="text-white/50 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{raw}</pre>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}
    </div>
  );
}

function SummaryDisplay({ summary }: { summary: ProjectSummary }) {
  const fields = [
    ["Project", summary.project_name], ["Client", summary.client],
    ["Location", summary.location], ["Type", summary.project_type],
    ["Contract", summary.contract_type], ["Est. Value", summary.estimated_value],
  ].filter(([, v]) => v && v !== "Not specified");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {fields.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/4 border border-white/6 p-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{k}</p>
            <p className="text-white text-sm font-medium">{v}</p>
          </div>
        ))}
      </div>
      {summary.scope_summary && (
        <div className="rounded-xl bg-blue-600/8 border border-blue-500/15 p-4">
          <p className="text-blue-300 text-xs uppercase tracking-wider mb-2">Scope Summary</p>
          <p className="text-white/80 text-sm leading-relaxed">{summary.scope_summary}</p>
        </div>
      )}
      {summary.scope_by_trade && Object.keys(summary.scope_by_trade).length > 0 && (
        <div className="space-y-2">
          <p className="text-white/40 text-xs uppercase tracking-wider">Scope by Trade</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(summary.scope_by_trade)
              .filter(([, v]) => v && v !== "Not specified")
              .map(([trade, desc]) => (
                <div key={trade} className="rounded-lg bg-white/3 border border-white/6 p-3">
                  <p className="text-white/45 text-[10px] uppercase tracking-wider mb-1">{trade.replace(/_/g, " ")}</p>
                  <p className="text-white/75 text-xs">{desc}</p>
                </div>
              ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {summary.site_constraints?.length ? <BulletCard title="Site Constraints" items={summary.site_constraints} color="yellow" /> : null}
        {summary.exclusions?.length ? <BulletCard title="Exclusions" items={summary.exclusions} color="red" /> : null}
        {summary.key_risks?.length ? <BulletCard title="Key Risks" items={summary.key_risks} color="orange" /> : null}
      </div>
    </div>
  );
}

function BulletCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  const cls: Record<string, string> = {
    yellow: "border-yellow-500/15 bg-yellow-500/5 text-yellow-400",
    red: "border-red-500/15 bg-red-500/5 text-red-400",
    orange: "border-orange-500/15 bg-orange-500/5 text-orange-400",
  };
  return (
    <div className={cn("rounded-xl border p-3 space-y-1.5", cls[color])}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{title}</p>
      {items.slice(0, 5).map((item, i) => <p key={i} className="text-xs opacity-80">• {item}</p>)}
    </div>
  );
}

/* ── Module: Requirements Register ──────────────────────────────────────── */
function RequirementsModule({ requirements, setRequirements, initialReqs }: {
  requirements: Requirements;
  setRequirements: (r: Requirements) => void;
  initialReqs?: Requirements | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialReqs && Object.keys(initialReqs).length > 0) {
      setExpanded(Object.keys(initialReqs));
    }
  }, [initialReqs]);

  const extract = async () => {
    if (!file) return;
    setLoading(true); setRaw(""); setError("");
    const fd = new FormData(); fd.append("file", file);
    let accumulated = "";
    try {
      await streamPost(`${API}/api/v1/preconstruction/requirements`, fd, false, t => {
        accumulated += t; setRaw(accumulated);
      });
      const json = accumulated.match(/\{[\s\S]*\}/)?.[0] || accumulated;
      const parsed: Requirements = JSON.parse(json);
      const withChecked: Requirements = {};
      for (const [trade, items] of Object.entries(parsed)) {
        withChecked[trade] = (items as RequirementItem[]).map(i => ({ ...i, checked: false }));
      }
      setRequirements(withChecked);
      setExpanded(Object.keys(withChecked));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to extract requirements");
    } finally { setLoading(false); }
  };

  const toggle = (trade: string) =>
    setExpanded(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);

  const toggleItem = (trade: string, idx: number) => {
    setRequirements({
      ...requirements,
      [trade]: requirements[trade].map((item, i) => i === idx ? { ...item, checked: !item.checked } : item),
    });
  };

  const reqs = Object.keys(requirements).length > 0 ? requirements : (initialReqs ?? {});
  const total = Object.values(reqs).flat().length;
  const checked = Object.values(reqs).flat().filter(i => i.checked).length;

  if (total === 0) return (
    <div className="space-y-6">
      <div onClick={() => inputRef.current?.click()}
        className={cn("border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors",
          file ? "border-blue-500/50 bg-blue-500/5" : "border-white/10 hover:border-white/20 bg-white/2")}>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => setFile(e.target.files?.[0] || null)} />
        {file
          ? <div className="flex items-center justify-center gap-3"><FileText className="w-6 h-6 text-blue-400" /><p className="text-white font-medium">{file.name}</p></div>
          : <div className="space-y-2"><ClipboardList className="w-8 h-8 text-white/20 mx-auto" /><p className="text-white/50">Drop tender PDF to extract requirements</p></div>
        }
      </div>
      {file && !loading && (
        <button onClick={extract}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors flex items-center justify-center gap-2">
          <ClipboardList className="w-4 h-4" /> Extract Requirements
        </button>
      )}
      {loading && (
        <div className="rounded-2xl border border-white/8 bg-white/2 p-6 space-y-3">
          <div className="flex items-center gap-2 text-blue-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Extracting requirements...
          </div>
          <pre className="text-white/50 text-xs font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">{raw}</pre>
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400 text-sm">{error}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-green-400 text-sm font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />{total} requirements extracted
          </span>
          <span className="text-white/35 text-sm">{checked}/{total} reviewed</span>
        </div>
        <button onClick={() => setRequirements({})} className="text-white/25 hover:text-white/50 text-xs transition-colors">Re-extract</button>
      </div>
      <div className="w-full bg-white/5 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${total ? (checked / total) * 100 : 0}%` }} />
      </div>
      <div className="space-y-2">
        {Object.entries(reqs).map(([trade, items]) => (
          <div key={trade} className="rounded-xl border border-white/8 overflow-hidden">
            <button onClick={() => toggle(trade)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-white/70 text-sm font-medium capitalize">{trade.replace(/_/g, " ")}</span>
                <span className="text-xs bg-white/8 text-white/35 px-2 py-0.5 rounded-full">{items.length}</span>
                {items.some(i => i.critical) && (
                  <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">has critical</span>
                )}
              </div>
              {expanded.includes(trade) ? <ChevronDown className="w-4 h-4 text-white/25" /> : <ChevronRight className="w-4 h-4 text-white/25" />}
            </button>
            <AnimatePresence>
              {expanded.includes(trade) && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="divide-y divide-white/4">
                    {items.map((item, i) => (
                      <div key={i} onClick={() => toggleItem(trade, i)}
                        className={cn("flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                          item.checked ? "bg-green-500/5" : "hover:bg-white/2")}>
                        {item.checked
                          ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          : <Circle className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn("text-sm", item.checked ? "text-white/35 line-through" : "text-white/80")}>{item.item}</p>
                            {item.critical && <span className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-semibold">CRITICAL</span>}
                          </div>
                          {item.detail && <p className="text-white/30 text-xs mt-0.5">{item.detail}</p>}
                          {item.source && <p className="text-white/20 text-[10px] mt-0.5">📄 {item.source}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Module: Gap Checker ─────────────────────────────────────────────────── */
function GapCheckerModule({ requirements, summary }: { requirements: Requirements; summary?: ProjectSummary | null }) {
  const [items, setItems] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<GapResult | null>(null);
  const [error, setError] = useState("");
  const hasReqs = Object.keys(requirements).length > 0;

  const check = async () => {
    const filtered = items.filter(i => i.trim());
    if (!filtered.length || !hasReqs) return;
    setLoading(true); setRaw(""); setResult(null); setError("");
    let accumulated = "";
    try {
      await streamPost(
        `${API}/api/v1/preconstruction/gap-check`,
        JSON.stringify({ requirements, estimate_items: filtered }),
        true, t => { accumulated += t; setRaw(accumulated); }
      );
      const json = accumulated.match(/\{[\s\S]*\}/)?.[0] || accumulated;
      setResult(JSON.parse(json));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gap check failed");
    } finally { setLoading(false); }
  };

  const riskColor = (s: number) => s >= 70 ? "text-red-400" : s >= 40 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-6">
      {!hasReqs && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-yellow-400 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Go to Requirements Register first — extract requirements from your tender, then come back here.
        </div>
      )}
      <div className="space-y-3">
        <p className="text-white/50 text-sm">Enter your estimate line items (one per row, press Enter to add):</p>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input value={item}
                onChange={e => setItems(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                onKeyDown={e => e.key === "Enter" && setItems(prev => [...prev, ""])}
                placeholder={`e.g. "Concrete slab 150mm — 450m²"`}
                className="flex-1 bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 transition-colors" />
              {items.length > 1 && (
                <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                  className="text-white/20 hover:text-white/50 p-2 transition-colors"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setItems(prev => [...prev, ""])}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/50 text-sm transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add line item
        </button>
      </div>

      <button onClick={check} disabled={!hasReqs || loading || !items.some(i => i.trim())}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Checking...</> : <><CheckSquare className="w-4 h-4" />Check for Gaps</>}
      </button>

      {loading && (
        <pre className="text-white/35 text-xs font-mono max-h-28 overflow-y-auto whitespace-pre-wrap bg-white/2 rounded-xl p-4">{raw}</pre>
      )}
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400 text-sm">{error}</div>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 flex items-center gap-5">
            <div className="text-center shrink-0">
              <p className={cn("text-4xl font-bold", riskColor(result.risk_score))}>{result.risk_score}</p>
              <p className="text-white/25 text-xs mt-1">Risk Score</p>
            </div>
            <div className="flex-1">
              <p className="text-white/70 text-sm">{result.risk_summary}</p>
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-green-400">{result.covered.length} covered</span>
                <span className="text-red-400">{result.missing.length} missing</span>
                <span className="text-yellow-400">{result.ambiguous.length} ambiguous</span>
              </div>
            </div>
            <button onClick={() => exportGapCheckPDF(result, summary ?? undefined)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm font-medium transition-colors shrink-0">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          </div>

          {result.missing.length > 0 && (
            <div className="space-y-2">
              <p className="text-red-400 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Missing Items ({result.missing.length})
              </p>
              {result.missing.map((m, i) => (
                <div key={i} className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white/80 text-sm flex-1">{m.item}</p>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold border",
                      m.risk === "high" ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : m.risk === "medium" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                      : "text-green-400 border-green-500/30 bg-green-500/10"
                    )}>{m.risk.toUpperCase()}</span>
                  </div>
                  <p className="text-white/35 text-xs">{m.trade} — {m.reason}</p>
                </div>
              ))}
            </div>
          )}

          {result.ambiguous.length > 0 && (
            <div className="space-y-2">
              <p className="text-yellow-400 text-sm font-semibold">Ambiguous ({result.ambiguous.length})</p>
              {result.ambiguous.map((a, i) => (
                <div key={i} className="rounded-xl border border-yellow-500/10 bg-yellow-500/3 p-3">
                  <p className="text-white/70 text-sm">{a.item}</p>
                  <p className="text-white/30 text-xs mt-0.5">{a.trade} — {a.note}</p>
                </div>
              ))}
            </div>
          )}

          {result.covered.length > 0 && (
            <details className="rounded-xl border border-green-500/10 bg-green-500/3">
              <summary className="px-4 py-3 text-green-400 text-sm font-medium cursor-pointer select-none">
                ✓ {result.covered.length} items covered
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {result.covered.map((c, i) => (
                  <p key={i} className="text-white/35 text-xs">• {c.item} <span className="text-white/20">({c.trade})</span></p>
                ))}
              </div>
            </details>
          )}
        </motion.div>
      )}
    </div>
  );
}

function ComingSoon({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/2 p-16 flex flex-col items-center justify-center gap-3">
      <Icon className="w-8 h-8 text-white/8" />
      <p className="text-white/18 text-sm">{label} — coming soon</p>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function PreConstructionPage() {
  const { user } = useAuth();
  const { tenders, fetch, save, update, remove } = useTenderStore();
  const [activeId, setActiveId] = useState("documents");
  const [activeTenderId, setActiveTenderId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [requirements, setRequirements] = useState<Requirements>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) fetch(user.id);
  }, [user?.id, fetch]);

  const active = allItems.find(i => i.id === activeId)!;
  const hasData = !!(summary || Object.keys(requirements).length > 0);

  const handleSave = async () => {
    if (!user?.id || !hasData) return;
    setSaving(true);
    const name = summary?.project_name || "Untitled Tender";
    if (activeTenderId) {
      await update(activeTenderId, {
        project_name: name,
        summary: summary as unknown as Record<string, unknown> ?? null,
        requirements: requirements as unknown as Record<string, unknown>,
      });
      toast.success("Tender saved");
    } else {
      const t = await save(user.id, {
        project_name: name, status: "active",
        summary: summary as unknown as Record<string, unknown> ?? null,
        requirements: requirements as unknown as Record<string, unknown>,
        gap_result: null, file_name: null,
      });
      if (t) { setActiveTenderId(t.id); toast.success("Tender saved"); }
    }
    setSaving(false);
  };

  const handleLoad = (t: Tender) => {
    setActiveTenderId(t.id);
    setSummary(t.summary as unknown as ProjectSummary ?? null);
    setRequirements((t.requirements as unknown as Requirements) ?? {});
    setActiveId("documents");
    toast.success(`Loaded: ${t.project_name}`);
  };

  const handleNew = () => {
    setActiveTenderId(null); setSummary(null); setRequirements({});
    setActiveId("documents");
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (activeTenderId === id) handleNew();
    toast.success("Tender deleted");
  };

  return (
    <div className="flex flex-col h-full">
      <TenderBar
        tenders={tenders} activeTenderId={activeTenderId}
        onSelect={handleLoad} onNew={handleNew}
        onSave={handleSave} onDelete={handleDelete}
        hasData={hasData} saving={saving}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left mini-nav */}
        <aside className="w-56 shrink-0 border-r border-white/8 bg-white/2 flex flex-col py-4 px-2 overflow-y-auto">
          <div className="flex items-center gap-2 px-3 pb-4 border-b border-white/8 mb-2">
            <HardHat className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-white text-sm font-semibold">Pre-Construction</span>
          </div>

          {summary?.project_name && (
            <div className="mx-2 mb-3 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/15">
              <p className="text-[9px] text-blue-400/50 uppercase tracking-wider">Active Tender</p>
              <p className="text-blue-300 text-xs font-medium truncate mt-0.5">{summary.project_name}</p>
            </div>
          )}

          {sections.map(section => (
            <div key={section.label} className="mb-2">
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold text-white/22 uppercase tracking-wider">
                {section.label}
              </p>
              {section.items.map(item => (
                <button key={item.id} onClick={() => setActiveId(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                    activeId === item.id ? "bg-blue-600/20 text-blue-400" : "text-white/42 hover:text-white/72 hover:bg-white/5"
                  )}>
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px] font-medium flex-1">{item.label}</span>
                  {item.ai && <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-semibold">AI</span>}
                  {item.id === "requirements" && Object.keys(requirements).length > 0 && (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <motion.div key={activeId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center">
                <active.icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-white text-xl font-bold">{active.label}</h1>
                <p className="text-white/30 text-sm">
                  {activeId === "documents"    && "Upload your tender package — AI reads and summarises everything"}
                  {activeId === "requirements" && "AI extracts every item that must be priced, organised by trade"}
                  {activeId === "gap-checker"  && "Enter your estimate and AI flags what's missing before you submit"}
                  {activeId === "go-no-go"     && "Score this tender against your strategic criteria"}
                  {activeId === "bid-register" && "Track all active tenders in one place"}
                  {activeId === "rates"        && "Your labour, plant and material rate database"}
                  {activeId === "prelims"      && "Calculate site setup, supervision and temporary services"}
                </p>
              </div>
            </div>

            {activeId === "documents"    && <DocumentModule onSummary={setSummary} initialSummary={summary} />}
            {activeId === "requirements" && <RequirementsModule requirements={requirements} setRequirements={setRequirements} initialReqs={requirements} />}
            {activeId === "gap-checker"  && <GapCheckerModule requirements={requirements} summary={summary} />}
            {activeId === "go-no-go"     && <ComingSoon label="Go / No-Go Scoring" icon={Scale} />}
            {activeId === "bid-register" && <ComingSoon label="Bid Register" icon={BookOpen} />}
            {activeId === "rates"        && <ComingSoon label="Rates Database" icon={Calculator} />}
            {activeId === "prelims"      && <ComingSoon label="Prelims Calculator" icon={FileSearch} />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
