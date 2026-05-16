"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown, RefreshCw, MapPin, User, Calendar, DollarSign,
  TrendingUp, Loader2, Building2, Users, Check, Plus, X,
  Pencil, Check as CheckIcon,
} from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useProjectStore, ProjectSummary } from "@/lib/stores/projectStore";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  trade?: string;
  status?: string;
}

interface OverviewBucket {
  overdue: number;
  next_7: number;
  later: number;
  closed: number;
  total: number;
}

interface Overview {
  rfi: OverviewBucket;
  submittals: OverviewBucket;
  schedule: OverviewBucket;
  inspections: OverviewBucket;
  observations: OverviewBucket;
  punch_list: OverviewBucket;
  meetings: OverviewBucket;
}

const OVERVIEW_ROWS: { key: keyof Overview; label: string }[] = [
  { key: "rfi",          label: "RFI"          },
  { key: "submittals",   label: "Submittals"   },
  { key: "schedule",     label: "Schedule"     },
  { key: "inspections",  label: "Inspections"  },
  { key: "observations", label: "Observations" },
  { key: "punch_list",   label: "Punch List"   },
  { key: "meetings",     label: "Meetings"     },
];

const BLANK_MEMBER = { name: "", role: "", trade: "", email: "", phone: "", status: "active" };

// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    onhold:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const cls = map[s] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border capitalize", cls)}>
      {status ?? "—"}
    </span>
  );
}

// ─── Stacked Bar — full-width, absolute-positioned segments ─
// Uses position:absolute so width:100% on the container always works in <td>

function StackedBar({ data }: { data: OverviewBucket }) {
  const open = data.overdue + data.next_7 + data.later;

  if (open === 0 && data.closed === 0) {
    return (
      <div style={{ width: "100%", height: 28, background: "rgba(100,100,100,0.1)", borderRadius: 4 }} />
    );
  }
  if (open === 0) {
    return (
      <div
        style={{
          width: "100%", height: 28, borderRadius: 4,
          background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>All {data.closed} closed ✓</span>
      </div>
    );
  }

  const rPct = (data.overdue / open) * 100;
  const yPct = (data.next_7  / open) * 100;
  const gPct = (data.later   / open) * 100;

  // Segment definitions: [left%, width%, color, count]
  const segments: [number, number, string, number][] = [];
  let cursor = 0;
  if (data.overdue > 0) { segments.push([cursor, rPct, "#ef4444", data.overdue]); cursor += rPct; }
  if (data.next_7  > 0) { segments.push([cursor, yPct, "#f59e0b", data.next_7]);  cursor += yPct; }
  if (data.later   > 0) { segments.push([cursor, gPct, "#22c55e", data.later]);   cursor += gPct; }

  return (
    <div style={{ position: "relative", width: "100%", height: 28, borderRadius: 4, overflow: "hidden" }}>
      {segments.map(([left, width, color, count], i) => (
        <div
          key={i}
          style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${left}%`, width: `${width}%`,
            background: color,
            borderLeft: i > 0 ? "2px solid rgba(0,0,0,0.15)" : undefined,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title={`${count} item${count !== 1 ? "s" : ""}`}
        >
          {width >= 6 && (
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.4)", userSelect: "none" }}>
              {count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inline editable cell ─────────────────────────────────

function EditableCell({
  value,
  placeholder,
  onSave,
  type = "text",
}: {
  value?: string;
  placeholder?: string;
  onSave: (val: string) => Promise<void>;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = async () => {
    if (draft === (value ?? "")) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="w-full min-w-0 px-1.5 py-0.5 text-sm bg-muted border border-blue-500/50 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-blue-400 shrink-0" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-left hover:text-foreground transition-colors w-full"
      title="Click to edit"
    >
      {value ? (
        <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate">{value}</span>
      ) : (
        <span className="text-muted-foreground/35 italic text-xs">{placeholder ?? "click to add"}</span>
      )}
      <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-all shrink-0" />
    </button>
  );
}

// ─── Project Dropdown ─────────────────────────────────────

function ProjectDropdown({
  projects, selectedId, onChange,
}: { projects: ProjectSummary[]; selectedId: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted/50 transition-colors min-w-65 justify-between"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md gradient-blue flex items-center justify-center shrink-0">
            <Building2 className="w-3 h-3 text-white" />
          </div>
          <span className="truncate max-w-45">{selected?.name ?? "Select Project"}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.13 }}
              className="absolute top-full mt-1.5 left-0 z-50 w-full min-w-75 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-left",
                    p.id === selectedId && "bg-blue-500/10"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium truncate", p.id === selectedId && "text-blue-400")}>{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.progress_percentage ?? 0}% complete</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.id === selectedId && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Info Card ────────────────────────────────────────────

function InfoCard({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div className="text-sm font-medium text-foreground leading-tight">{children}</div>
    </div>
  );
}

// ─── Add Member Panel ─────────────────────────────────────

function AddMemberPanel({
  projectId,
  onAdded,
  onClose,
}: { projectId: string; onAdded: () => void; onClose: () => void }) {
  const [form, setForm] = useState(BLANK_MEMBER);
  const [saving, setSaving] = useState(false);
  const API = process.env.NEXT_PUBLIC_API_URL;

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const inputCls = "w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  const submit = async () => {
    if (!form.name || !form.role) { toast.error("Name and role are required"); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/v1/workforce/workers`, { ...form, project_id: projectId });
      toast.success(`${form.name} added to project team`);
      setForm(BLANK_MEMBER);
      onAdded();
    } catch {
      toast.error("Failed to add team member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground text-sm">Add Team Member</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
          <input placeholder="e.g. John Smith" value={form.name} onChange={f("name")} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Role *</label>
          <input placeholder="e.g. Site Engineer" value={form.role} onChange={f("role")} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
          <input type="email" placeholder="name@company.com" value={form.email} onChange={f("email")} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mobile</label>
          <input placeholder="+1 555-0000" value={form.phone} onChange={f("phone")} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trade</label>
          <input placeholder="e.g. Civil, MEP, Safety" value={form.trade} onChange={f("trade")} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
          <select value={form.status} onChange={f("status")} className={inputCls}>
            <option value="active">Active</option>
            <option value="onleave">On Leave</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          Add Member
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors">
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function ProjectsPage() {
  const { projects, currentProjectId, setProjects, setCurrentProjectId } = useProjectStore();
  const [team, setTeam]           = useState<TeamMember[]>([]);
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL;

  // Load project list once, keep store in sync
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/api/v1/projects/`);
        const p: ProjectSummary[] = res.data.projects || [];
        setProjects(p);
        if (!currentProjectId && p.length > 0) setCurrentProjectId(p[0].id);
      } catch {
        toast.error("Failed to load projects");
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedId = currentProjectId ?? projects[0]?.id ?? null;
  // Use normalized data from the store — already has total_budget, spent_to_date, progress_percentage
  const detail = projects.find((p) => p.id === selectedId) ?? null;

  const fetchTeamAndOverview = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [teamRes, ovRes] = await Promise.all([
        axios.get(`${API}/api/v1/projects/${id}/workforce`),
        axios.get(`${API}/api/v1/projects/${id}/overview`),
      ]);
      setTeam(teamRes.data.workforce || []);
      setOverview(ovRes.data.overview ?? null);
    } catch {
      toast.error("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    if (selectedId) fetchTeamAndOverview(selectedId);
  }, [selectedId, fetchTeamAndOverview]);

  // Patch a single field on a team member — syncs to Workforce module
  const patchMember = async (memberId: string, field: string, value: string) => {
    await axios.patch(`${API}/api/v1/workforce/workers/${memberId}`, { [field]: value });
    setTeam((prev) => prev.map((m) => m.id === memberId ? { ...m, [field]: value } : m));
    toast.success("Updated");
  };

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const fmtCurrency = (n?: number) =>
    (n != null && n > 0) ? `$${(n / 1_000_000).toFixed(2)}M` : "—";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Project Homepage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live data across all modules · click any Email or Mobile cell to edit</p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectDropdown projects={projects} selectedId={selectedId} onChange={(id) => setCurrentProjectId(id)} />
          <button
            onClick={() => selectedId && fetchTeamAndOverview(selectedId)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh all data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Building2 className="w-14 h-14 mb-4 opacity-20" />
          <p className="text-base font-medium">No projects found</p>
        </div>
      )}

      {detail && (
        <motion.div key={detail.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* ── Info cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <InfoCard icon={Building2} label="Status"><StatusBadge status={detail.status} /></InfoCard>
            <InfoCard icon={MapPin} label="Location">{(detail as any).location || "—"}</InfoCard>
            <InfoCard icon={User} label="Client">{(detail as any).client || "—"}</InfoCard>
            <InfoCard icon={Calendar} label="Start">{fmt((detail as any).start_date)}</InfoCard>
            <InfoCard icon={Calendar} label="End">{fmt((detail as any).end_date)}</InfoCard>
            <InfoCard icon={DollarSign} label="Budget">{fmtCurrency(detail.total_budget)}</InfoCard>
          </div>

          {/* ── Progress bar ── */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <TrendingUp className="w-4 h-4 text-blue-400" />Overall Progress
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Spent: <span className="font-medium text-foreground">{fmtCurrency(detail.spent_to_date)}</span></span>
                <span className="text-muted-foreground">Budget: <span className="font-medium text-foreground">{fmtCurrency(detail.total_budget)}</span></span>
                <span className="font-bold text-blue-400 text-base">{detail.progress_percentage ?? 0}%</span>
              </div>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${detail.progress_percentage ?? 0}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="h-full rounded-full bg-linear-to-r from-blue-600 to-blue-400"
              />
            </div>
          </div>

          {/* ── Project Team ── */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <Users className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-foreground">Project Team</h2>
              <span className="text-xs text-muted-foreground ml-1">{team.length} member{team.length !== 1 ? "s" : ""}</span>
              <button
                onClick={() => setShowAddMember((v) => !v)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />Add Member
              </button>
            </div>

            {/* Add member form */}
            <AnimatePresence>
              {showAddMember && selectedId && (
                <div className="px-5 pt-4">
                  <AddMemberPanel
                    projectId={selectedId}
                    onAdded={() => { setShowAddMember(false); fetchTeamAndOverview(selectedId!); }}
                    onClose={() => setShowAddMember(false)}
                  />
                </div>
              )}
            </AnimatePresence>

            {loading && team.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : team.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No team members assigned to this project</p>
                <p className="text-xs mt-1 opacity-60">Click "Add Member" above or assign a project_id in the Workforce page</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                      <th className="px-5 py-3 text-left font-semibold">Role</th>
                      <th className="px-5 py-3 text-left font-semibold">Name</th>
                      <th className="px-5 py-3 text-left font-semibold">Email <span className="normal-case text-[10px] opacity-60">✎ editable</span></th>
                      <th className="px-5 py-3 text-left font-semibold">Mobile <span className="normal-case text-[10px] opacity-60">✎ editable</span></th>
                      <th className="px-5 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {team.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20 whitespace-nowrap">
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-foreground whitespace-nowrap">{m.name}</td>
                        <td className="px-5 py-3 min-w-40">
                          <EditableCell
                            value={m.email}
                            placeholder="add email"
                            type="email"
                            onSave={(val) => patchMember(m.id, "email", val)}
                          />
                        </td>
                        <td className="px-5 py-3 min-w-36">
                          <EditableCell
                            value={m.phone}
                            placeholder="add mobile"
                            onSave={(val) => patchMember(m.id, "phone", val)}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Project Overview ── */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">

            {loading && !overview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : overview ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 130 }} />
                    <col />
                    <col style={{ width: 90 }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Overview
                      </th>
                      <th className="px-4 py-3 text-center">
                        {/* Inline legend exactly like the screenshot */}
                        <div className="flex items-center justify-center gap-5 text-xs font-semibold">
                          <span className="flex items-center gap-1.5 text-red-400">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#ef4444" }} />
                            Overdue
                          </span>
                          <span className="flex items-center gap-1.5 text-amber-400">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} />
                            Next 7 Days
                          </span>
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#22c55e" }} />
                            &gt;7 Days
                          </span>
                        </div>
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total Open
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {OVERVIEW_ROWS.map(({ key, label }) => {
                      const d = overview[key];
                      const open = d.overdue + d.next_7 + d.later;
                      return (
                        <tr key={key} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3 font-semibold text-foreground whitespace-nowrap text-sm">{label}</td>
                          <td className="px-4 py-3">
                            <StackedBar data={d} />
                          </td>
                          <td className="px-5 py-3 text-right font-bold tabular-nums text-foreground">{open}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

        </motion.div>
      )}
    </div>
  );
}
