"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown, RefreshCw, MapPin, User, Calendar, DollarSign,
  TrendingUp, Loader2, Building2, Users, Check, Plus, X,
  Pencil, Check as CheckIcon, Upload, ClipboardList,
  AlertCircle, Clock3, CheckCircle2, ChevronRight, Box,
  FileSignature, ShieldCheck, ShoppingCart, Trash2,
} from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useProjectStore, ProjectSummary } from "@/lib/stores/projectStore";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { toast } from "sonner";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";

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

interface ExtractedMember {
  name: string;
  role: string;
  trade?: string;
  email?: string;
  phone?: string;
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

interface ProjectContract {
  id: string;
  title: string;
  contractor: string;
  value: number;
  status: string;
  start_date?: string;
  end_date?: string;
}

interface ProjectPermit {
  id: string;
  name: string;
  type: string;
  status: string;
  expiry_date?: string;
  risk_level: string;
}

interface ProjectPurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  material?: string;
  total_amount: number;
  status: string;
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

// ─── Shared glass button styles (mirrors Cost & Safety pages) ─

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const ghostBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    completed: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    onhold:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const cls = map[s] ?? "bg-white/5 text-white/40 border-white/10";
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
      <div style={{ width: "100%", height: 28, background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
    );
  }
  if (open === 0) {
    return (
      <div
        style={{
          width: "100%", height: 28, borderRadius: 4,
          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>All {data.closed} closed ✓</span>
      </div>
    );
  }

  const rPct = (data.overdue / open) * 100;
  const yPct = (data.next_7  / open) * 100;
  const gPct = (data.later   / open) * 100;

  // Segment definitions: [left%, width%, color, count]
  const segments: [number, number, string, number][] = [];
  let cursor = 0;
  if (data.overdue > 0) { segments.push([cursor, rPct, "#EF4444", data.overdue]); cursor += rPct; }
  if (data.next_7  > 0) { segments.push([cursor, yPct, "#F59E0B", data.next_7]);  cursor += yPct; }
  if (data.later   > 0) { segments.push([cursor, gPct, "#10B981", data.later]);   cursor += gPct; }

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
          className="w-full min-w-0 px-1.5 py-0.5 text-sm text-white rounded-md outline-none border focus:border-cyan-500/50"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(0,212,255,0.4)" }}
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-left hover:text-white transition-colors w-full"
      title="Click to edit"
    >
      {value ? (
        <span className="text-white/50 group-hover:text-white transition-colors truncate">{value}</span>
      ) : (
        <span className="text-white/25 italic text-xs">{placeholder ?? "click to add"}</span>
      )}
      <Pencil className="w-3 h-3 text-white/0 group-hover:text-white/50 transition-all shrink-0" />
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
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors min-w-65 justify-between"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)" }}
          >
            <Building2 className="w-3 h-3 text-white" />
          </div>
          <span className="truncate max-w-45">{selected?.name ?? "Select Project"}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-white/40 shrink-0 transition-transform", open && "rotate-180")} />
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
              className="absolute top-full mt-1.5 left-0 z-50 w-full min-w-75 rounded-xl overflow-hidden"
              style={{
                background: "rgba(4, 11, 25, 0.98)",
                border: "1px solid rgba(0,212,255,0.12)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.05)",
                backdropFilter: "blur(24px)",
              }}
            >
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left",
                    p.id === selectedId
                      ? "bg-cyan-500/10 hover:bg-cyan-500/15"
                      : "hover:bg-white/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium truncate text-white", p.id === selectedId && "text-cyan-400")}>{p.name}</p>
                    <p className="text-xs text-white/35">{p.progress_percentage ?? 0}% complete</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.id === selectedId && <Check className="w-3.5 h-3.5 text-cyan-400" />}
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
    <div className="glass-card px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs text-white/35">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div className="text-sm font-medium text-white leading-tight">{children}</div>
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
      className="glass-card p-5"
      style={{ borderColor: ACCENT.cyan.border, background: ACCENT.cyan.bg }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">Add Team Member</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-white/40 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-white/35 mb-1 block">Full Name *</label>
          <input placeholder="e.g. John Smith" value={form.name} onChange={f("name")} className={glassInputClass} style={glassInputStyle} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1 block">Role *</label>
          <input placeholder="e.g. Site Engineer" value={form.role} onChange={f("role")} className={glassInputClass} style={glassInputStyle} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1 block">Email</label>
          <input type="email" placeholder="name@company.com" value={form.email} onChange={f("email")} className={glassInputClass} style={glassInputStyle} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1 block">Mobile</label>
          <input placeholder="+1 555-0000" value={form.phone} onChange={f("phone")} className={glassInputClass} style={glassInputStyle} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1 block">Trade</label>
          <input placeholder="e.g. Civil, MEP, Safety" value={form.trade} onChange={f("trade")} className={glassInputClass} style={glassInputStyle} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1 block">Status</label>
          <select value={form.status} onChange={f("status")} className={glassInputClass} style={glassInputStyle}>
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
          className={primaryBtn}
          style={gradientButtonStyle}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          Add Member
        </button>
        <button onClick={onClose} className={ghostBtn} style={ghostBtnStyle}>
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function ProjectsPage() {
  const { projects, currentProjectId, setProjects, setCurrentProjectId } = useProjectStore();
  const { counters, triggerRefresh } = useDataRefreshStore();
  const [team, setTeam]           = useState<TeamMember[]>([]);
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [contracts, setContracts] = useState<ProjectContract[]>([]);
  const [permits, setPermits]     = useState<ProjectPermit[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ProjectPurchaseOrder[]>([]);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [poForm, setPoForm] = useState({ po_number: "", supplier_name: "", material: "", total_amount: 0 });
  const [addingPO, setAddingPO] = useState(false);
  const [vendorOptions, setVendorOptions] = useState<{ id: string; name: string }[]>([]);
  const [deletingPO, setDeletingPO] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [extractedMembers, setExtractedMembers] = useState<ExtractedMember[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const memberFileRef = useRef<HTMLInputElement>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({
    name: "", location: "", client: "", budget: "",
    start_date: "", end_date: "", project_type: "Building",
  });
  const [newProjectLoading, setNewProjectLoading] = useState(false);
  const [newProjectIFC, setNewProjectIFC] = useState<File | null>(null);
  const [newProjectIFCLoading, setNewProjectIFCLoading] = useState(false);
  const newProjectIFCRef = useRef<HTMLInputElement>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  // Load project list, keep store in sync
  const loadProjects = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/v1/projects/`);
      const p: ProjectSummary[] = res.data.projects || [];
      setProjects(p);
      if (!currentProjectId && p.length > 0) setCurrentProjectId(p[0].id);
    } catch {
      toast.error("Failed to load projects");
    }
  }, [API]); // eslint-disable-line react-hooks/exhaustive-deps

  // Runs on mount, and again whenever a project is created/edited/deleted anywhere else (e.g. Dashboard)
  useEffect(() => { loadProjects(); }, [counters.projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vendor register, for the PO form's autocomplete — refetches whenever the
  // Vendors module changes so a newly-added vendor shows up here without a reload.
  useEffect(() => {
    axios.get(`${API}/api/v1/vendors/`)
      .then((res) => setVendorOptions((res.data.vendors || []).map((v: any) => ({ id: v.id, name: v.name }))))
      .catch(() => {});
  }, [API, counters.vendors]);

  const selectedId = currentProjectId ?? projects[0]?.id ?? null;
  // Use normalized data from the store — already has total_budget, spent_to_date, progress_percentage
  const detail = projects.find((p) => p.id === selectedId) ?? null;

  const fetchTeamAndOverview = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [teamRes, ovRes, contractsRes, permitsRes, poRes] = await Promise.all([
        axios.get(`${API}/api/v1/projects/${id}/workforce`),
        axios.get(`${API}/api/v1/projects/${id}/overview`),
        axios.get(`${API}/api/v1/projects/${id}/contracts`),
        axios.get(`${API}/api/v1/projects/${id}/permits`),
        axios.get(`${API}/api/v1/projects/${id}/purchase-orders`),
      ]);
      setTeam(teamRes.data.workforce || []);
      setOverview(ovRes.data.overview ?? null);
      setContracts(contractsRes.data.contracts || []);
      setPermits(permitsRes.data.permits || []);
      setPurchaseOrders(poRes.data.purchase_orders || []);
    } catch {
      toast.error("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    if (selectedId) fetchTeamAndOverview(selectedId);
  }, [selectedId, fetchTeamAndOverview]);

  // Refresh project detail data when any dependent module changes elsewhere
  useEffect(() => {
    if (selectedId) fetchTeamAndOverview(selectedId);
    // schedule/cost changes shift progress_percentage & spent_to_date, which live
    // on the project list itself (see `detail` above), so reload it too — otherwise
    // the Overall Progress bar stays stuck at its value from the last full page load.
    loadProjects();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    counters.workers, counters.safety, counters.schedule, counters.cost,
    counters.contracts, counters.compliance, counters.equipment, counters.procurement,
  ]);

  const addPurchaseOrder = async () => {
    if (!selectedId || !poForm.po_number.trim() || !poForm.supplier_name.trim()) {
      toast.error("PO number and vendor are required");
      return;
    }
    setAddingPO(true);
    try {
      await axios.post(`${API}/api/v1/procurement/purchase-orders`, {
        project_id: selectedId,
        po_number: poForm.po_number,
        supplier_name: poForm.supplier_name,
        material: poForm.material,
        total_amount: poForm.total_amount,
        status: "pending",
      });
      toast.success("Purchase order added");
      setPoForm({ po_number: "", supplier_name: "", material: "", total_amount: 0 });
      setPoFormOpen(false);
      triggerRefresh("procurement");
    } catch {
      toast.error("Failed to add purchase order");
    } finally {
      setAddingPO(false);
    }
  };

  const deletePurchaseOrder = async (id: string) => {
    setDeletingPO(id);
    try {
      await axios.delete(`${API}/api/v1/procurement/purchase-orders/${id}`);
      setPurchaseOrders((prev) => prev.filter((po) => po.id !== id));
      toast.success("Purchase order removed");
      triggerRefresh("procurement");
    } catch {
      toast.error("Failed to remove purchase order");
    } finally {
      setDeletingPO(null);
    }
  };

  const handleMemberFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/api/v1/workforce/extract-members`, formData);
      const found: ExtractedMember[] = res.data.extracted_members ?? [];
      setExtractedMembers(found);
      if (found.length > 0) {
        toast.success(`Found ${found.length} team member${found.length !== 1 ? "s" : ""} — review below.`);
      } else {
        toast.info("No team members found in the document.");
      }
    } catch {
      toast.error("Failed to extract members from file");
    } finally {
      setUploadLoading(false);
    }
  };

  const addExtractedMember = async (member: ExtractedMember, idx: number) => {
    if (!selectedId) { toast.error("No project selected"); return; }
    setAddingMember(String(idx));
    try {
      await axios.post(`${API}/api/v1/workforce/workers`, { ...member, project_id: selectedId });
      setExtractedMembers((prev) => prev.filter((_, i) => i !== idx));
      toast.success(`${member.name} added to project team`);
      fetchTeamAndOverview(selectedId);
    } catch {
      toast.error(`Failed to add ${member.name}`);
    } finally {
      setAddingMember(null);
    }
  };

  const addAllExtractedMembers = async () => {
    if (!selectedId) { toast.error("No project selected"); return; }
    setAddingMember("all");
    let added = 0;
    for (const member of extractedMembers) {
      try {
        await axios.post(`${API}/api/v1/workforce/workers`, { ...member, project_id: selectedId });
        added++;
      } catch { /* skip individual failures */ }
    }
    setExtractedMembers([]);
    toast.success(`Added ${added} member${added !== 1 ? "s" : ""} to project team`);
    if (selectedId) fetchTeamAndOverview(selectedId);
    setAddingMember(null);
  };

  // Patch a single field on a team member — syncs to Workforce module
  const patchMember = async (memberId: string, field: string, value: string) => {
    await axios.patch(`${API}/api/v1/workforce/workers/${memberId}`, { [field]: value });
    setTeam((prev) => prev.map((m) => m.id === memberId ? { ...m, [field]: value } : m));
    toast.success("Updated");
  };

  const handleCreateProject = async () => {
    if (!newProjectForm.name.trim()) { toast.error("Project name is required"); return; }
    setNewProjectLoading(true);
    try {
      const res = await axios.post(`${API}/api/v1/projects/`, {
        name: newProjectForm.name,
        location: newProjectForm.location || undefined,
        client: newProjectForm.client || undefined,
        budget: newProjectForm.budget ? parseFloat(newProjectForm.budget) : 0,
        start_date: newProjectForm.start_date || undefined,
        end_date: newProjectForm.end_date || undefined,
        project_type: newProjectForm.project_type,
        status: "active",
      });
      const newProject = res.data.project;
      toast.success(`Project "${newProjectForm.name}" created!`);

      // If IFC was uploaded, parse it and save meshes to localStorage for Digital Twin
      if (newProjectIFC && newProject?.id) {
        setNewProjectIFCLoading(true);
        try {
          const fd = new FormData();
          fd.append("file", newProjectIFC);
          const ifcRes = await axios.post(`${API}/api/v1/bim/parse-3d`, fd);
          if (ifcRes.data.success && ifcRes.data.meshes?.length > 0) {
            localStorage.setItem(`dt_ifc_${newProject.id}`, JSON.stringify({
              meshes: ifcRes.data.meshes,
              filename: newProjectIFC.name,
            }));
            toast.success(`IFC model linked to project!`);
          }
        } catch { toast.error("IFC upload failed (project still created)"); }
        finally { setNewProjectIFCLoading(false); }
      }

      setShowNewProject(false);
      setNewProjectForm({ name: "", location: "", client: "", budget: "", start_date: "", end_date: "", project_type: "Building" });
      setNewProjectIFC(null);

      // Refresh project list and notify other pages (e.g. Dashboard)
      await loadProjects();
      triggerRefresh("projects");
      if (newProject?.id) setCurrentProjectId(newProject.id);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setNewProjectLoading(false);
    }
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
          <h1 className="text-4xl font-bold text-white tracking-tight">Project Homepage</h1>
          <p className="text-white/35 text-[13px] mt-1">Live data across all modules · click any Email or Mobile cell to edit</p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectDropdown projects={projects} selectedId={selectedId} onChange={(id) => setCurrentProjectId(id)} />
          <button
            onClick={() => selectedId && fetchTeamAndOverview(selectedId)}
            disabled={loading}
            className="p-2.5 rounded-xl text-white/50 hover:text-white transition-colors disabled:opacity-50"
            style={glassButtonStyle}
            title="Refresh all data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button
            className={primaryBtn}
            style={gradientButtonStyle}
            onClick={() => setShowNewProject(v => !v)}
          >
            <Plus className="w-4 h-4" />New Project
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showNewProject && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass-card p-6"
            style={{ borderColor: ACCENT.cyan.border }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />New Project
              </h2>
              <button onClick={() => setShowNewProject(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {[
                { label: "Project Name *", field: "name", placeholder: "e.g. Metro Bridge Phase 2", colSpan: "sm:col-span-2" },
                { label: "Project Type", field: "project_type", placeholder: "", isSelect: true },
                { label: "Location", field: "location", placeholder: "City, Country" },
                { label: "Client", field: "client", placeholder: "Client name" },
                { label: "Budget ($)", field: "budget", placeholder: "e.g. 5000000", type: "number" },
                { label: "Start Date", field: "start_date", placeholder: "", type: "date" },
                { label: "End Date", field: "end_date", placeholder: "", type: "date" },
              ].map(({ label, field, placeholder, colSpan, isSelect, type }) => (
                <div key={field} className={colSpan ?? ""}>
                  <label className="text-xs text-white/35 mb-1.5 block">{label}</label>
                  {isSelect ? (
                    <select
                      value={newProjectForm[field as keyof typeof newProjectForm]}
                      onChange={e => setNewProjectForm(p => ({ ...p, [field]: e.target.value }))}
                      className={glassInputClass}
                      style={glassInputStyle}
                    >
                      {["Building","Metro Bridge","Harbour","Road","Tunnel","Infrastructure","Other"].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type ?? "text"}
                      placeholder={placeholder}
                      value={newProjectForm[field as keyof typeof newProjectForm]}
                      onChange={e => setNewProjectForm(p => ({ ...p, [field]: e.target.value }))}
                      className={glassInputClass}
                      style={glassInputStyle}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* IFC Upload */}
            <div className="mb-5 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-medium text-white mb-1">IFC Model (optional)</p>
              <p className="text-xs text-white/35 mb-3">Upload an IFC file to auto-load in Digital Twin for this project</p>
              <input ref={newProjectIFCRef} type="file" className="hidden" accept=".ifc"
                onChange={e => setNewProjectIFC(e.target.files?.[0] || null)} />
              {newProjectIFC ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Box className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-cyan-400 flex-1 truncate">{newProjectIFC.name}</span>
                  <button onClick={() => setNewProjectIFC(null)} className="text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button
                  onClick={() => newProjectIFCRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-white/15 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-colors text-xs text-white/40"
                >
                  <Upload className="w-3.5 h-3.5" />Choose .ifc file
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                className={primaryBtn}
                style={gradientButtonStyle}
                disabled={newProjectLoading || newProjectIFCLoading}
                onClick={handleCreateProject}
              >
                {(newProjectLoading || newProjectIFCLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {newProjectIFCLoading ? "Uploading IFC..." : newProjectLoading ? "Creating..." : "Create Project"}
              </button>
              <button className={ghostBtn} style={ghostBtnStyle} onClick={() => setShowNewProject(false)}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-white/30">
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
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <TrendingUp className="w-4 h-4 text-cyan-400" />Overall Progress
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-white/35">Spent: <span className="font-medium text-white">{fmtCurrency(detail.spent_to_date)}</span></span>
                <span className="text-white/35">Budget: <span className="font-medium text-white">{fmtCurrency(detail.total_budget)}</span></span>
                <span className="font-bold text-cyan-400 text-base">{detail.progress_percentage ?? 0}%</span>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${detail.progress_percentage ?? 0}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #0891B2, #00D4FF)" }}
              />
            </div>
          </div>

          {/* ── Project Team ── */}
          <section className="glass-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <Users className="w-4 h-4 text-cyan-400" />
              <h2 className="font-semibold text-white">Project Team</h2>
              <span className="text-xs text-white/35 ml-1">{team.length} member{team.length !== 1 ? "s" : ""}</span>
              <div className="ml-auto flex items-center gap-2">
                {/* Hidden file input */}
                <input
                  ref={memberFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
                  onChange={handleMemberFileUpload}
                />
                <button
                  className={primaryBtn}
                  style={gradientButtonStyle}
                  disabled={uploadLoading}
                  onClick={() => memberFileRef.current?.click()}
                >
                  {uploadLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Upload className="w-4 h-4" />}
                  {uploadLoading ? "Extracting…" : "Upload"}
                </button>
                <button
                  className={primaryBtn}
                  style={gradientButtonStyle}
                  onClick={() => setShowAddMember((v) => !v)}
                >
                  <Plus className="w-4 h-4" />Add Member
                </button>
              </div>
            </div>

            {/* Extracted members review panel */}
            <AnimatePresence>
              {extractedMembers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mx-5 mt-4 glass-card p-4"
                  style={{ borderColor: ACCENT.green.border, background: ACCENT.green.bg }}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">Team Members Found in Document</p>
                      <p className="text-xs text-white/35 mt-0.5">Review and choose which to add</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={addAllExtractedMembers}
                        disabled={addingMember === "all"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60"
                      >
                        {addingMember === "all"
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Plus className="w-3 h-3" />}
                        Add All ({extractedMembers.length})
                      </button>
                      <button
                        onClick={() => setExtractedMembers([])}
                        className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {extractedMembers.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.03)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{m.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">{m.role}</span>
                            {m.trade && <span className="text-xs text-white/35">{m.trade}</span>}
                            {m.email && <span className="text-xs text-white/35">{m.email}</span>}
                            {m.phone && <span className="text-xs text-white/35">{m.phone}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => addExtractedMember(m, idx)}
                          disabled={addingMember === String(idx) || addingMember === "all"}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60 shrink-0"
                        >
                          {addingMember === String(idx)
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Plus className="w-3 h-3" />}
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              </div>
            ) : team.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No team members assigned to this project</p>
                <p className="text-xs mt-1 opacity-60">Click "Add Member" above or assign a project_id in the Workforce page</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-white/35 text-xs uppercase tracking-wider"
                      style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <th className="px-5 py-3 text-left font-semibold">Role</th>
                      <th className="px-5 py-3 text-left font-semibold">Name</th>
                      <th className="px-5 py-3 text-left font-semibold">Email <span className="normal-case text-[10px] opacity-60">✎ editable</span></th>
                      <th className="px-5 py-3 text-left font-semibold">Mobile <span className="normal-case text-[10px] opacity-60">✎ editable</span></th>
                      <th className="px-5 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {team.map((m) => (
                      <tr key={m.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-5 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-xs font-medium border border-cyan-500/20 whitespace-nowrap">
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{m.name}</td>
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
          <section className="glass-card overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-cyan-400" />
                <h2 className="font-semibold text-white">Project Overview</h2>
                <span className="text-xs text-white/35 ml-1">live tracking across all modules</span>
              </div>
              {/* Legend pills */}
              <div className="flex items-center gap-2">
                {[
                  { color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", label: "Overdue" },
                  { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", label: "Next 7d" },
                  { color: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: ">7 Days" },
                ].map(({ color, bg, border, label }) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                    style={{ background: bg, border: `1px solid ${border}`, color }}
                  >
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {loading && !overview ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : overview ? (() => {
              // Compute cross-row totals for the summary strip
              const totals = OVERVIEW_ROWS.reduce(
                (acc, { key }) => {
                  const d = overview[key];
                  acc.overdue += d.overdue;
                  acc.next7   += d.next_7;
                  acc.later   += d.later;
                  acc.closed  += d.closed;
                  return acc;
                },
                { overdue: 0, next7: 0, later: 0, closed: 0 }
              );

              return (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-4 divide-x divide-white/6" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {[
                      { icon: AlertCircle,   value: totals.overdue, label: "Overdue",    color: "text-red-400",     bg: "rgba(239,68,68,0.06)"    },
                      { icon: Clock3,        value: totals.next7,   label: "Next 7 Days", color: "text-amber-400",  bg: "rgba(245,158,11,0.06)"   },
                      { icon: ChevronRight,  value: totals.later,   label: ">7 Days",    color: "text-emerald-400", bg: "rgba(16,185,129,0.06)"    },
                      { icon: CheckCircle2,  value: totals.closed,  label: "Closed",     color: "text-cyan-400",    bg: "rgba(0,212,255,0.06)"    },
                    ].map(({ icon: Icon, value, label, color, bg }) => (
                      <div key={label} className="flex items-center gap-3 px-5 py-3.5" style={{ background: bg }}>
                        <Icon className={cn("w-4 h-4 shrink-0", color)} />
                        <div>
                          <p className={cn("text-lg font-bold tabular-nums leading-none", color)}>{value}</p>
                          <p className="text-[11px] text-white/35 mt-0.5">{label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-white/6">
                    {OVERVIEW_ROWS.map(({ key, label }) => {
                      const d = overview[key];
                      const open = d.overdue + d.next_7 + d.later;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors"
                        >
                          {/* Label */}
                          <div className="w-28 shrink-0">
                            <p className="text-sm font-semibold text-white">{label}</p>
                          </div>

                          {/* Bar */}
                          <div className="flex-1 min-w-0">
                            <StackedBar data={d} />
                          </div>

                          {/* Counts */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold tabular-nums text-white">{open}</p>
                              <p className="text-[10px] text-white/35">open</p>
                            </div>
                            {d.closed > 0 && (
                              <span
                                className="text-[11px] px-2 py-0.5 rounded-md font-medium tabular-nums"
                                style={{
                                  background: "rgba(16,185,129,0.08)",
                                  border: "1px solid rgba(16,185,129,0.2)",
                                  color: "#10B981",
                                }}
                              >
                                {d.closed} closed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })() : null}
          </section>

          {/* ── Contracts & Permits ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="glass-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <FileSignature className="w-4 h-4 text-cyan-400" />
                <h2 className="font-semibold text-white">Contracts</h2>
                <span className="text-xs text-white/35 ml-auto">{contracts.length}</span>
              </div>
              {loading && contracts.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                </div>
              ) : contracts.length === 0 ? (
                <p className="text-sm text-white/35 text-center py-8">No contracts for this project</p>
              ) : (
                <div className="divide-y divide-white/6 max-h-72 overflow-y-auto">
                  {contracts.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{c.title}</p>
                        <p className="text-xs text-white/35">{c.contractor}</p>
                      </div>
                      <span className="text-sm font-semibold text-white shrink-0">{fmtCurrency(c.value)}</span>
                      <span className={cn(
                        "text-[11px] px-2 py-0.5 rounded-md font-medium border shrink-0 capitalize",
                        c.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-white/35 border-white/10"
                      )}>
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-white">Permits</h2>
                <span className="text-xs text-white/35 ml-auto">{permits.length}</span>
              </div>
              {loading && permits.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                </div>
              ) : permits.length === 0 ? (
                <p className="text-sm text-white/35 text-center py-8">No permits for this project</p>
              ) : (
                <div className="divide-y divide-white/6 max-h-72 overflow-y-auto">
                  {permits.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.name}</p>
                        <p className="text-xs text-white/35">
                          {p.type}{p.expiry_date ? ` · Expires ${fmt(p.expiry_date)}` : ""}
                        </p>
                      </div>
                      <span className={cn(
                        "text-[11px] px-2 py-0.5 rounded-md font-medium border shrink-0",
                        p.status === "Approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : p.status === "Pending" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── Purchase Orders ── */}
          <section className="glass-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold text-white">Purchase Orders</h2>
              <span className="text-xs text-white/35 ml-auto mr-2">{purchaseOrders.length}</span>
              <button
                onClick={() => setPoFormOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white transition-colors"
                style={glassButtonStyle}
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                Add PO
              </button>
            </div>

            <AnimatePresence>
              {poFormOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
                    <input placeholder="PO Number *" value={poForm.po_number}
                      onChange={(e) => setPoForm({ ...poForm, po_number: e.target.value })}
                      className={glassInputClass} style={glassInputStyle} />
                    <input placeholder="Vendor *" value={poForm.supplier_name} list="po-vendor-options"
                      onChange={(e) => setPoForm({ ...poForm, supplier_name: e.target.value })}
                      className={glassInputClass} style={glassInputStyle} />
                    <datalist id="po-vendor-options">
                      {vendorOptions.map((v) => <option key={v.id} value={v.name} />)}
                    </datalist>
                    <input placeholder="Item / Description" value={poForm.material}
                      onChange={(e) => setPoForm({ ...poForm, material: e.target.value })}
                      className={glassInputClass} style={glassInputStyle} />
                    <input type="number" min="0" placeholder="Total Amount" value={poForm.total_amount}
                      onChange={(e) => setPoForm({ ...poForm, total_amount: parseFloat(e.target.value) || 0 })}
                      className={glassInputClass} style={glassInputStyle} />
                  </div>
                  <div className="px-4 pb-4">
                    <button onClick={addPurchaseOrder} disabled={addingPO}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                      style={gradientButtonStyle}>
                      {addingPO ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Save Purchase Order
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading && purchaseOrders.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              </div>
            ) : purchaseOrders.length === 0 ? (
              <p className="text-sm text-white/35 text-center py-8">No purchase orders for this project</p>
            ) : (
              <div className="divide-y divide-white/6 max-h-72 overflow-y-auto">
                {purchaseOrders.map((po) => (
                  <div key={po.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{po.po_number} · {po.supplier_name}</p>
                      {po.material && <p className="text-xs text-white/35 truncate">{po.material}</p>}
                    </div>
                    <span className="text-sm font-semibold text-white shrink-0">{fmtCurrency(po.total_amount)}</span>
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-md font-medium border shrink-0 capitalize",
                      po.status === "received" || po.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : po.status === "cancelled" ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    )}>
                      {po.status}
                    </span>
                    <button onClick={() => deletePurchaseOrder(po.id)} disabled={deletingPO === po.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors shrink-0">
                      {deletingPO === po.id
                        ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </motion.div>
      )}
    </div>
  );
}
