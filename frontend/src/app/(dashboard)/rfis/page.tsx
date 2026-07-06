"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, X, Loader2, ChevronDown, Search, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const CONSTRUCTION_MODULE_TABS = [
  { href: "/construction",   label: "Construction" },
  { href: "/daily-reports",  label: "Daily Reports" },
  { href: "/rfis",           label: "RFIs" },
  { href: "/meetings",       label: "Meetings" },
];

const API = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction`;

const STATUS_STYLES: Record<string, string> = {
  open:        "bg-blue-500/10 text-blue-400",
  in_review:   "bg-amber-500/10 text-amber-400",
  answered:    "bg-emerald-500/10 text-emerald-400",
  closed:      "bg-gray-500/10 text-gray-400",
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    "bg-gray-500/10 text-gray-400",
  medium: "bg-amber-500/10 text-amber-400",
  high:   "bg-red-500/10 text-red-400",
};

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function RFIsPage() {
  const [rfis, setRfis] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRfi, setSelectedRfi] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [responding, setResponding] = useState(false);

  const [form, setForm] = useState({
    project_id: "", subject: "", question: "",
    submitted_by: "", assigned_to: "", priority: "medium", due_date: "",
  });
  const [response, setResponse] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) {
        setSelectedProjectId(p[0].id);
        fetchRFIs(p[0].id);
      } else setLoading(false);
    } catch { setLoading(false); }
  };

  const fetchRFIs = async (projectId?: string) => {
    const id = projectId || selectedProjectId;
    if (!id) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/rfis/${id}`);
      setRfis(res.data.rfis || []);
    } catch { toast.error("Failed to load RFIs"); }
    finally { setLoading(false); }
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    fetchRFIs(projectId);
  };

  const handleCreate = async () => {
    if (!form.subject || !form.project_id) { toast.error("Project and subject are required"); return; }
    setCreating(true);
    try {
      await axios.post(`${API}/rfis`, form);
      toast.success("RFI created");
      setShowCreate(false);
      setSelectedProjectId(form.project_id);
      setForm({ project_id: form.project_id, subject: "", question: "", submitted_by: "", assigned_to: "", priority: "medium", due_date: "" });
      fetchRFIs(form.project_id);
    } catch { toast.error("Failed to create RFI"); }
    finally { setCreating(false); }
  };

  const handleRespond = async () => {
    if (!selectedRfi || !response) return;
    setResponding(true);
    try {
      await axios.patch(`${API}/rfis/${selectedRfi.id}`, {
        response,
        status: "answered",
        responded_date: new Date().toISOString().split("T")[0],
      });
      toast.success("Response submitted");
      setSelectedRfi(null);
      setResponse("");
      fetchRFIs(selectedRfi.project_id);
    } catch { toast.error("Failed to submit response"); }
    finally { setResponding(false); }
  };

  const filtered = rfis.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.subject?.toLowerCase().includes(q) || r.rfi_number?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: rfis.length,
    open: rfis.filter((r) => r.status === "open").length,
    answered: rfis.filter((r) => r.status === "answered").length,
    overdue: rfis.filter((r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== "closed").length,
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={CONSTRUCTION_MODULE_TABS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">RFI Tracker</h1>
          <p className="text-muted-foreground text-sm mt-1">Request for Information log</p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={selectedProjectId} onChange={(e) => handleProjectChange(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => { setForm((f) => ({ ...f, project_id: selectedProjectId })); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> New RFI
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total RFIs", value: stats.total, icon: MessageSquare, color: "text-blue-400 bg-blue-500/10" },
          { label: "Open",       value: stats.open,    icon: Clock,         color: "text-amber-400 bg-amber-500/10" },
          { label: "Answered",   value: stats.answered,icon: CheckCircle,   color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Overdue",    value: stats.overdue, icon: AlertTriangle,  color: "text-red-400 bg-red-500/10" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search RFIs…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none">
          {["all","open","in_review","answered","closed"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_"," ")}</option>
          ))}
        </select>
      </div>

      {/* RFI List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
            {search ? `No RFIs matching "${search}"` : "No RFIs yet — create the first one"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((rfi, i) => (
              <motion.div key={rfi.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors cursor-pointer"
                onClick={() => setSelectedRfi(rfi)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-muted-foreground">{rfi.rfi_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_STYLES[rfi.priority] || ""}`}>{rfi.priority}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{rfi.subject}</p>
                  {rfi.submitted_by && <p className="text-xs text-muted-foreground mt-0.5">Submitted by {rfi.submitted_by}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {rfi.due_date && <span className="text-xs text-muted-foreground hidden sm:block">{rfi.due_date}</span>}
                  <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_STYLES[rfi.status] || ""}`}>{rfi.status?.replace("_"," ")}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-foreground">New RFI</h3>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Project *</label>
                  <select className={inputClass} value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
                    <option value="">Select project…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Subject *</label>
                  <input className={inputClass} placeholder="e.g. Clarification on foundation depth" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Question</label>
                  <textarea className={inputClass} rows={3} placeholder="Detailed question…" value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Submitted By</label>
                    <input className={inputClass} placeholder="Name" value={form.submitted_by} onChange={(e) => setForm((f) => ({ ...f, submitted_by: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
                    <input className={inputClass} placeholder="Name" value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                    <select className={inputClass} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                      {["low","medium","high"].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
                    <input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 py-2 rounded-xl gradient-blue text-white text-sm flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RFI Detail Modal */}
      <AnimatePresence>
        {selectedRfi && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{selectedRfi.rfi_number}</p>
                  <h3 className="font-semibold text-foreground mt-0.5">{selectedRfi.subject}</h3>
                </div>
                <button onClick={() => setSelectedRfi(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              {selectedRfi.question && (
                <div className="mb-4 p-3 bg-secondary/40 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">Question</p>
                  <p className="text-sm text-foreground">{selectedRfi.question}</p>
                </div>
              )}
              {selectedRfi.response && (
                <div className="mb-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <p className="text-xs text-emerald-400 mb-1">Response</p>
                  <p className="text-sm text-foreground">{selectedRfi.response}</p>
                </div>
              )}
              {selectedRfi.status !== "answered" && selectedRfi.status !== "closed" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Submit Response</label>
                  <textarea className={inputClass} rows={3} placeholder="Type response…" value={response} onChange={(e) => setResponse(e.target.value)} />
                  <button onClick={handleRespond} disabled={responding || !response} className="mt-3 w-full py-2 rounded-xl gradient-blue text-white text-sm flex items-center justify-center gap-2">
                    {responding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Submit Response
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="RFI Tracker" placeholder="Ask about RFIs, responses, status…" pageSummaryData={{ total: stats.total, open: stats.open }} />
    </div>
  );
}
