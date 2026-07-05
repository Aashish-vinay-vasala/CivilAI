"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, MessageSquare, FileCheck, FileText,
  Users, Plus, X, Loader2, CheckCircle, AlertTriangle,
  Clock, Search, Edit2, Save, Trash2, Sparkles,
  DollarSign, BarChart3, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const tabs = [
  { id: "punch", label: "Punch List", icon: ClipboardList, color: "text-red-400" },
  { id: "rfi", label: "RFI Tracker", icon: MessageSquare, color: "text-blue-400" },
  { id: "submittals", label: "Submittals", icon: FileCheck, color: "text-cyan-400" },
  { id: "daily", label: "Daily Reports", icon: FileText, color: "text-emerald-400" },
  { id: "meetings", label: "Meetings", icon: Users, color: "text-orange-400" },
  { id: "costcodes", label: "Cost Codes", icon: DollarSign, color: "text-yellow-400" },
];

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function ConstructionPage() {
  const [activeTab, setActiveTab] = useState("punch");
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Data states
  const [punchItems, setPunchItems] = useState<any[]>([]);
  const [rfis, setRfis] = useState<any[]>([]);
  const [submittals, setSubmittals] = useState<any[]>([]);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [costCodes, setCostCodes] = useState<any[]>([]);

  // Form states
  const [punchForm, setPunchForm] = useState({ item: "", location: "", assigned_to: "", priority: "medium", due_date: "", description: "", category: "" });
  const [rfiForm, setRfiForm] = useState({ subject: "", question: "", submitted_by: "", assigned_to: "", priority: "medium", due_date: "" });
  const [submittalForm, setSubmittalForm] = useState({ title: "", type: "Shop Drawing", submitted_by: "", reviewed_by: "", submitted_date: "", description: "" });
  const [dailyForm, setDailyForm] = useState({ report_date: new Date().toISOString().split("T")[0], weather: "", temperature: "", workers_on_site: "", work_completed: "", issues: "", materials_used: "", equipment_used: "", created_by: "" });
  const [meetingForm, setMeetingForm] = useState({ meeting_date: "", meeting_type: "Progress Meeting", attendees: "", location: "", agenda: "", discussion: "", action_items: "", created_by: "" });
  const [costCodeForm, setCostCodeForm] = useState({ code: "", description: "", category: "", budgeted_amount: "", actual_amount: "", unit: "" });

  const [search, setSearch] = useState("");
  const [aiSummary, setAiSummary] = useState("");

  // Edit / delete state
  const [editItem, setEditItem] = useState<any | null>(null); // item being edited + _tab
  const [editLoading, setEditLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [extractedItems, setExtractedItems] = useState<any[]>([]);
  const [extractLoading, setExtractLoading] = useState(false);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);

  const CREATE_ENDPOINTS: Record<string, string> = {
    punch: "punch-list",
    rfi: "rfis",
    submittals: "submittals",
    meetings: "meetings",
    costcodes: "cost-codes",
  };

  const handleExtractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    e.target.value = "";
    if (activeTab === "daily") { toast.error("Upload extraction is not available for Daily Reports"); return; }
    setExtractLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/extract?type=${activeTab}`, fd
      );
      const found = res.data.extracted_items ?? [];
      setExtractedItems(found);
      toast.success(found.length > 0 ? `Found ${found.length} item(s) — review below.` : "No items found in document.");
    } catch { toast.error("Failed to extract from file"); }
    finally { setExtractLoading(false); }
  };

  const addExtractedItem = async (item: any, idx: number) => {
    setAddingExtracted(String(idx));
    const endpoint = CREATE_ENDPOINTS[activeTab];
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/${endpoint}`, {
        ...item,
        project_id: projectId,
        ...(activeTab === "costcodes" ? {
          budgeted_amount: parseFloat(item.budgeted_amount) || 0,
          actual_amount: parseFloat(item.actual_amount) || 0,
        } : {}),
      });
      setExtractedItems(prev => prev.filter((_, i) => i !== idx));
      toast.success("Item added");
      fetchData();
    } catch { toast.error("Failed to add item"); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedItems = async () => {
    setAddingExtracted("all");
    const endpoint = CREATE_ENDPOINTS[activeTab];
    let added = 0;
    for (const item of extractedItems) {
      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/${endpoint}`, {
          ...item,
          project_id: projectId,
          ...(activeTab === "costcodes" ? {
            budgeted_amount: parseFloat(item.budgeted_amount) || 0,
            actual_amount: parseFloat(item.actual_amount) || 0,
          } : {}),
        });
        added++;
      } catch { /* skip */ }
    }
    setExtractedItems([]);
    toast.success(`Added ${added} item(s)`);
    fetchData();
    setAddingExtracted(null);
  };

  const PATCH_ENDPOINTS: Record<string, string> = {
    punch: "punch-list",
    rfi: "rfis",
    submittals: "submittals",
    daily: "daily-reports",
    meetings: "meetings",
    costcodes: "cost-codes",
  };

  const openEdit = (item: any, tab: string) => {
    setEditItem({ ...item, _tab: tab });
    if (tab === "punch") setPunchForm({ item: item.item || "", location: item.location || "", assigned_to: item.assigned_to || "", priority: item.priority || "medium", due_date: item.due_date || "", description: item.description || "", category: item.category || "" });
    if (tab === "rfi") setRfiForm({ subject: item.subject || "", question: item.question || "", submitted_by: item.submitted_by || "", assigned_to: item.assigned_to || "", priority: item.priority || "medium", due_date: item.due_date || "" });
    if (tab === "submittals") setSubmittalForm({ title: item.title || "", type: item.type || "Shop Drawing", submitted_by: item.submitted_by || "", reviewed_by: item.reviewed_by || "", submitted_date: item.submitted_date || "", description: item.description || "" });
    if (tab === "daily") setDailyForm({ report_date: item.report_date || "", weather: item.weather || "", temperature: item.temperature?.toString() || "", workers_on_site: item.workers_on_site?.toString() || "", work_completed: item.work_completed || "", issues: item.issues || "", materials_used: item.materials_used || "", equipment_used: item.equipment_used || "", created_by: item.created_by || "" });
    if (tab === "meetings") setMeetingForm({ meeting_date: item.meeting_date || "", meeting_type: item.meeting_type || "Progress Meeting", attendees: item.attendees || "", location: item.location || "", agenda: item.agenda || "", discussion: item.discussion || "", action_items: item.action_items || "", created_by: item.created_by || "" });
    if (tab === "costcodes") setCostCodeForm({ code: item.code || "", description: item.description || "", category: item.category || "", budgeted_amount: item.budgeted_amount?.toString() || "", actual_amount: item.actual_amount?.toString() || "", unit: item.unit || "" });
    setShowAdd(true);
    setAiSummary("");
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditItem(null);
    setAiSummary("");
  };

  const handleUpdate = async () => {
    if (!editItem) return;
    setEditLoading(true);
    const tab = editItem._tab;
    const endpoint = PATCH_ENDPOINTS[tab];
    let payload: any = {};
    if (tab === "punch") payload = { ...punchForm };
    if (tab === "rfi") payload = { ...rfiForm };
    if (tab === "submittals") payload = { ...submittalForm };
    if (tab === "daily") payload = { ...dailyForm, workers_on_site: parseInt(dailyForm.workers_on_site) || 0, temperature: parseFloat(dailyForm.temperature) || undefined };
    if (tab === "meetings") payload = { ...meetingForm };
    if (tab === "costcodes") payload = { ...costCodeForm, budgeted_amount: parseFloat(costCodeForm.budgeted_amount) || 0, actual_amount: parseFloat(costCodeForm.actual_amount) || 0 };
    try {
      await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/${endpoint}/${editItem.id}`, payload);
      toast.success("Updated successfully!");
      closeForm();
      fetchData();
    } catch { toast.error("Failed to update"); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async (id: string, tab: string) => {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    setDeletingId(id);
    const endpoint = PATCH_ENDPOINTS[tab];
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/${endpoint}/${id}`);
      toast.success("Deleted");
      fetchData();
    } catch { toast.error("Failed to delete"); }
    finally { setDeletingId(null); }
  };

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    setExtractedItems([]);
    if (projectId) fetchData();
  }, [projectId, activeTab]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) setProjectId(p[0].id);
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "punch") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/punch-list/${projectId}`);
        setPunchItems(res.data.items || []);
      } else if (activeTab === "rfi") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/rfis/${projectId}`);
        setRfis(res.data.rfis || []);
      } else if (activeTab === "submittals") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/submittals/${projectId}`);
        setSubmittals(res.data.submittals || []);
      } else if (activeTab === "daily") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/daily-reports/${projectId}`);
        setDailyReports(res.data.reports || []);
      } else if (activeTab === "meetings") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/meetings/${projectId}`);
        setMeetings(res.data.meetings || []);
      } else if (activeTab === "costcodes") {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/cost-codes/${projectId}`);
        setCostCodes(res.data.cost_codes || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    setLoading(true);
    setAiSummary("");
    try {
      if (activeTab === "punch") {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/punch-list`, { ...punchForm, project_id: projectId });
        setPunchForm({ item: "", location: "", assigned_to: "", priority: "medium", due_date: "", description: "", category: "" });
      } else if (activeTab === "rfi") {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/rfis`, { ...rfiForm, project_id: projectId });
        setRfiForm({ subject: "", question: "", submitted_by: "", assigned_to: "", priority: "medium", due_date: "" });
      } else if (activeTab === "submittals") {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/submittals`, { ...submittalForm, project_id: projectId });
        setSubmittalForm({ title: "", type: "Shop Drawing", submitted_by: "", reviewed_by: "", submitted_date: "", description: "" });
      } else if (activeTab === "daily") {
        const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/daily-reports`, { ...dailyForm, project_id: projectId, workers_on_site: parseInt(dailyForm.workers_on_site) || 0, temperature: parseFloat(dailyForm.temperature) || null });
        if (res.data.ai_summary) setAiSummary(res.data.ai_summary);
        setDailyForm({ report_date: new Date().toISOString().split("T")[0], weather: "", temperature: "", workers_on_site: "", work_completed: "", issues: "", materials_used: "", equipment_used: "", created_by: "" });
      } else if (activeTab === "meetings") {
        const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/meetings`, { ...meetingForm, project_id: projectId });
        if (res.data.ai_summary) setAiSummary(res.data.ai_summary);
        setMeetingForm({ meeting_date: "", meeting_type: "Progress Meeting", attendees: "", location: "", agenda: "", discussion: "", action_items: "", created_by: "" });
      } else if (activeTab === "costcodes") {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/cost-codes`, { ...costCodeForm, project_id: projectId, budgeted_amount: parseFloat(costCodeForm.budgeted_amount) || 0, actual_amount: parseFloat(costCodeForm.actual_amount) || 0 });
        setCostCodeForm({ code: "", description: "", category: "", budgeted_amount: "", actual_amount: "", unit: "" });
      }
      toast.success("Saved successfully!");
      setShowAdd(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to save");
    } finally { setLoading(false); }
  };

  const handleClose = async (id: string, type: string) => {
    try {
      if (type === "punch") {
        await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/punch-list/${id}`, { status: "closed", closed_date: new Date().toISOString().split("T")[0] });
      } else if (type === "rfi") {
        await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/rfis/${id}`, { status: "closed", responded_date: new Date().toISOString().split("T")[0] });
      }
      toast.success("Closed!");
      fetchData();
    } catch { toast.error("Failed"); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "in_progress": case "under_review": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "closed": case "approved": case "done": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "approved_with_comments": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-secondary text-muted-foreground border-border";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-400";
      case "medium": return "text-orange-400";
      default: return "text-emerald-400";
    }
  };

  const selectedProject = projects.find(p => p.id === projectId);

  // KPIs
  const openPunch = punchItems.filter(i => i.status === "open").length;
  const openRfi = rfis.filter(r => r.status === "open").length;
  const pendingSubmittals = submittals.filter(s => s.status === "pending" || s.status === "under_review").length;
  const totalCostCodes = costCodes.length;

  const costCodesChart = costCodes.map(c => ({
    name: c.code,
    budget: c.budgeted_amount / 1000,
    actual: c.actual_amount / 1000,
    variance: (c.budgeted_amount - c.actual_amount) / 1000,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Construction Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Punch List · RFI · Submittals · Daily Reports · Meetings · Cost Codes
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {activeTab !== "daily" && (
            <>
              <input ref={extractFileRef} type="file" className="hidden"
                accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={handleExtractUpload} />
              <Button className="gradient-blue text-white border-0" disabled={extractLoading || !projectId}
                onClick={() => extractFileRef.current?.click()}>
                {extractLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload
              </Button>
            </>
          )}
          <button onClick={() => { setShowAdd(true); setAiSummary(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
            Add {tabs.find(t => t.id === activeTab)?.label}
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Open Punch Items", value: openPunch.toString(), icon: ClipboardList, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
          { label: "Open RFIs", value: openRfi.toString(), icon: MessageSquare, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Pending Submittals", value: pendingSubmittals.toString(), icon: FileCheck, color: "border-cyan-500/20 bg-cyan-500/5", iconColor: "text-cyan-400" },
          { label: "Cost Codes", value: totalCostCodes.toString(), icon: DollarSign, color: "border-yellow-500/20 bg-yellow-500/5", iconColor: "text-yellow-400" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowAdd(false); setSearch(""); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              activeTab === tab.id
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add / Edit Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className={`bg-card border rounded-2xl p-6 ${editItem ? "border-orange-500/30" : "border-blue-500/30"}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">
                {editItem ? "Edit" : "Add"} {tabs.find(t => t.id === activeTab)?.label}
              </h3>
              <button onClick={closeForm}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Punch List Form */}
            {activeTab === "punch" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Item *</label>
                  <input className={inputClass} placeholder="e.g. Fix cracked wall tile"
                    value={punchForm.item} onChange={(e) => setPunchForm(f => ({ ...f, item: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                  <input className={inputClass} placeholder="e.g. Ground Floor - Lobby"
                    value={punchForm.location} onChange={(e) => setPunchForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
                  <input className={inputClass} placeholder="Worker name"
                    value={punchForm.assigned_to} onChange={(e) => setPunchForm(f => ({ ...f, assigned_to: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <input className={inputClass} placeholder="e.g. Finishing, Plumbing"
                    value={punchForm.category} onChange={(e) => setPunchForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                  <select className={inputClass} value={punchForm.priority}
                    onChange={(e) => setPunchForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
                  <input type="date" className={inputClass} value={punchForm.due_date}
                    onChange={(e) => setPunchForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Describe the defect..."
                    value={punchForm.description} onChange={(e) => setPunchForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
            )}

            {/* RFI Form */}
            {activeTab === "rfi" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Subject *</label>
                  <input className={inputClass} placeholder="e.g. Foundation depth clarification"
                    value={rfiForm.subject} onChange={(e) => setRfiForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Question</label>
                  <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Describe the question in detail..."
                    value={rfiForm.question} onChange={(e) => setRfiForm(f => ({ ...f, question: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Submitted By</label>
                  <input className={inputClass} placeholder="Your name"
                    value={rfiForm.submitted_by} onChange={(e) => setRfiForm(f => ({ ...f, submitted_by: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
                  <input className={inputClass} placeholder="Engineer/Architect name"
                    value={rfiForm.assigned_to} onChange={(e) => setRfiForm(f => ({ ...f, assigned_to: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                  <select className={inputClass} value={rfiForm.priority}
                    onChange={(e) => setRfiForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
                  <input type="date" className={inputClass} value={rfiForm.due_date}
                    onChange={(e) => setRfiForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Submittals Form */}
            {activeTab === "submittals" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                  <input className={inputClass} placeholder="e.g. Concrete Mix Design"
                    value={submittalForm.title} onChange={(e) => setSubmittalForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                  <select className={inputClass} value={submittalForm.type}
                    onChange={(e) => setSubmittalForm(f => ({ ...f, type: e.target.value }))}>
                    <option>Shop Drawing</option>
                    <option>Material Sample</option>
                    <option>Product Data</option>
                    <option>Test Report</option>
                    <option>Method Statement</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Submitted By</label>
                  <input className={inputClass} placeholder="Contractor name"
                    value={submittalForm.submitted_by} onChange={(e) => setSubmittalForm(f => ({ ...f, submitted_by: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Reviewed By</label>
                  <input className={inputClass} placeholder="Engineer name"
                    value={submittalForm.reviewed_by} onChange={(e) => setSubmittalForm(f => ({ ...f, reviewed_by: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Submitted Date</label>
                  <input type="date" className={inputClass} value={submittalForm.submitted_date}
                    onChange={(e) => setSubmittalForm(f => ({ ...f, submitted_date: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                  <textarea className={`${inputClass} resize-none`} rows={2}
                    value={submittalForm.description} onChange={(e) => setSubmittalForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Daily Report Form */}
            {activeTab === "daily" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                  <input type="date" className={inputClass} value={dailyForm.report_date}
                    onChange={(e) => setDailyForm(f => ({ ...f, report_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Created By</label>
                  <input className={inputClass} placeholder="Your name" value={dailyForm.created_by}
                    onChange={(e) => setDailyForm(f => ({ ...f, created_by: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Weather</label>
                  <input className={inputClass} placeholder="e.g. Sunny, Cloudy" value={dailyForm.weather}
                    onChange={(e) => setDailyForm(f => ({ ...f, weather: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Temp (°C)</label>
                  <input type="number" className={inputClass} placeholder="e.g. 32" value={dailyForm.temperature}
                    onChange={(e) => setDailyForm(f => ({ ...f, temperature: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Workers On Site</label>
                  <input type="number" className={inputClass} placeholder="e.g. 45" value={dailyForm.workers_on_site}
                    onChange={(e) => setDailyForm(f => ({ ...f, workers_on_site: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Equipment Used</label>
                  <input className={inputClass} placeholder="e.g. Tower Crane, Pump" value={dailyForm.equipment_used}
                    onChange={(e) => setDailyForm(f => ({ ...f, equipment_used: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Work Completed</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Describe work done today..."
                    value={dailyForm.work_completed} onChange={(e) => setDailyForm(f => ({ ...f, work_completed: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Issues / Delays</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Any issues or delays..."
                    value={dailyForm.issues} onChange={(e) => setDailyForm(f => ({ ...f, issues: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Materials Used</label>
                  <input className={inputClass} placeholder="e.g. Concrete 30m3, Rebar 2 tons" value={dailyForm.materials_used}
                    onChange={(e) => setDailyForm(f => ({ ...f, materials_used: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Meeting Form */}
            {activeTab === "meetings" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                  <input type="date" className={inputClass} value={meetingForm.meeting_date}
                    onChange={(e) => setMeetingForm(f => ({ ...f, meeting_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Meeting Type</label>
                  <select className={inputClass} value={meetingForm.meeting_type}
                    onChange={(e) => setMeetingForm(f => ({ ...f, meeting_type: e.target.value }))}>
                    <option>Progress Meeting</option>
                    <option>Safety Meeting</option>
                    <option>Design Review</option>
                    <option>Coordination Meeting</option>
                    <option>Client Meeting</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                  <input className={inputClass} placeholder="e.g. Site Office" value={meetingForm.location}
                    onChange={(e) => setMeetingForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Created By</label>
                  <input className={inputClass} placeholder="Your name" value={meetingForm.created_by}
                    onChange={(e) => setMeetingForm(f => ({ ...f, created_by: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Attendees</label>
                  <input className={inputClass} placeholder="e.g. John Smith, Sarah Johnson, Client Rep"
                    value={meetingForm.attendees} onChange={(e) => setMeetingForm(f => ({ ...f, attendees: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Agenda</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Meeting agenda items..."
                    value={meetingForm.agenda} onChange={(e) => setMeetingForm(f => ({ ...f, agenda: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Discussion</label>
                  <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Key discussion points..."
                    value={meetingForm.discussion} onChange={(e) => setMeetingForm(f => ({ ...f, discussion: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Action Items</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} placeholder="List action items with owners..."
                    value={meetingForm.action_items} onChange={(e) => setMeetingForm(f => ({ ...f, action_items: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Cost Codes Form */}
            {activeTab === "costcodes" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Code *</label>
                  <input className={inputClass} placeholder="e.g. 03000" value={costCodeForm.code}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, code: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <input className={inputClass} placeholder="e.g. Structural, MEP" value={costCodeForm.category}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
                  <input className={inputClass} placeholder="e.g. Concrete Works" value={costCodeForm.description}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Budgeted Amount ($)</label>
                  <input type="number" className={inputClass} placeholder="e.g. 500000" value={costCodeForm.budgeted_amount}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, budgeted_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Actual Amount ($)</label>
                  <input type="number" className={inputClass} placeholder="e.g. 450000" value={costCodeForm.actual_amount}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, actual_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                  <input className={inputClass} placeholder="e.g. M3, Ton, LS" value={costCodeForm.unit}
                    onChange={(e) => setCostCodeForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <p className="text-xs font-medium text-blue-400">AI Generated Summary</p>
                </div>
                <p className="text-xs text-muted-foreground">{aiSummary}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={closeForm}
                className="px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">
                Cancel
              </button>
              {editItem ? (
                <button onClick={handleUpdate} disabled={editLoading}
                  className="px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium flex items-center gap-2">
                  {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              ) : (
                <button onClick={handleAdd} disabled={loading}
                  className="px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium flex items-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted Items Review Panel */}
      <AnimatePresence>
        {extractedItems.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">
                  Extracted {tabs.find(t => t.id === activeTab)?.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {extractedItems.length} item(s) found — select which to add
                </p>
              </div>
              <Button size="sm" className="gradient-blue text-white border-0"
                disabled={addingExtracted === "all"} onClick={addAllExtractedItems}>
                {addingExtracted === "all"
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Add All
              </Button>
            </div>
            <div className="space-y-2">
              {extractedItems.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  {activeTab === "punch" && <ClipboardList className="w-4 h-4 text-red-400 shrink-0" />}
                  {activeTab === "rfi" && <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />}
                  {activeTab === "submittals" && <FileCheck className="w-4 h-4 text-cyan-400 shrink-0" />}
                  {activeTab === "meetings" && <Users className="w-4 h-4 text-orange-400 shrink-0" />}
                  {activeTab === "costcodes" && <DollarSign className="w-4 h-4 text-yellow-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    {activeTab === "punch" && (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">{item.item}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.location, item.assigned_to, item.priority, item.category].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    )}
                    {activeTab === "rfi" && (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">{item.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.submitted_by && `From: ${item.submitted_by}`, item.assigned_to && `To: ${item.assigned_to}`, item.priority].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    )}
                    {activeTab === "submittals" && (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.type, item.submitted_by, item.submitted_date].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    )}
                    {activeTab === "meetings" && (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.meeting_type} — {item.meeting_date}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.attendees, item.location].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    )}
                    {activeTab === "costcodes" && (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-mono text-yellow-400 mr-2">{item.code}</span>
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[item.category, item.budgeted_amount && `Budget: $${Number(item.budgeted_amount).toLocaleString()}`].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    )}
                  </div>
                  <Button size="sm" variant="outline" disabled={addingExtracted === String(idx)}
                    onClick={() => addExtractedItem(item, idx)}>
                    {addingExtracted === String(idx) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label}...`}
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-full" />
      </div>

      {/* Content */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <>
            {/* Punch List */}
            {activeTab === "punch" && (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
                  <span className="col-span-3">Item</span>
                  <span className="col-span-2">Location</span>
                  <span className="col-span-2">Assigned</span>
                  <span className="col-span-1">Priority</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2">Actions</span>
                </div>
                {punchItems.filter(i => !search || i.item?.toLowerCase().includes(search.toLowerCase())).map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-foreground">{item.item}</p>
                      {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground truncate">{item.location || "—"}</p>
                    <p className="col-span-2 text-xs text-foreground truncate">{item.assigned_to || "—"}</p>
                    <span className={`col-span-1 text-xs font-medium ${getPriorityColor(item.priority)}`}>
                      {item.priority}
                    </span>
                    <span className={`col-span-2 text-xs px-2 py-1 rounded-full border w-fit ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                    <div className="col-span-2 flex items-center gap-1">
                      {item.status !== "closed" && (
                        <button onClick={() => handleClose(item.id, "punch")} title="Mark closed"
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      )}
                      <button onClick={() => openEdit(item, "punch")} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id, "punch")} title="Delete"
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        {deletingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
                {punchItems.length === 0 && (
                  <div className="text-center py-8">
                    <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No punch list items</p>
                  </div>
                )}
              </div>
            )}

            {/* RFI List */}
            {activeTab === "rfi" && (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
                  <span className="col-span-1">No.</span>
                  <span className="col-span-3">Subject</span>
                  <span className="col-span-2">Submitted By</span>
                  <span className="col-span-2">Assigned To</span>
                  <span className="col-span-1">Priority</span>
                  <span className="col-span-1">Status</span>
                  <span className="col-span-2">Actions</span>
                </div>
                {rfis.filter(r => !search || r.subject?.toLowerCase().includes(search.toLowerCase())).map((rfi, i) => (
                  <motion.div key={rfi.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="grid grid-cols-12 gap-2 items-start px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                    <span className="col-span-1 text-xs text-muted-foreground">{rfi.rfi_number}</span>
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-foreground">{rfi.subject}</p>
                      {rfi.question && <p className="text-xs text-muted-foreground truncate mt-0.5">{rfi.question}</p>}
                      {rfi.response && (
                        <div className="mt-1 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-xs text-emerald-400">Response: {rfi.response}</p>
                        </div>
                      )}
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">{rfi.submitted_by || "—"}</p>
                    <p className="col-span-2 text-xs text-foreground">{rfi.assigned_to || "—"}</p>
                    <span className={`col-span-1 text-xs font-medium ${getPriorityColor(rfi.priority)}`}>{rfi.priority}</span>
                    <span className={`col-span-1 text-xs px-2 py-1 rounded-full border w-fit ${getStatusColor(rfi.status)}`}>{rfi.status}</span>
                    <div className="col-span-2 flex items-center gap-1">
                      {rfi.status !== "closed" && (
                        <button onClick={() => handleClose(rfi.id, "rfi")} title="Mark closed"
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      )}
                      <button onClick={() => openEdit(rfi, "rfi")} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(rfi.id, "rfi")} title="Delete"
                        disabled={deletingId === rfi.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        {deletingId === rfi.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
                {rfis.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No RFIs</p>
                  </div>
                )}
              </div>
            )}

            {/* Submittals */}
            {activeTab === "submittals" && (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
                  <span className="col-span-1">No.</span>
                  <span className="col-span-3">Title</span>
                  <span className="col-span-2">Type</span>
                  <span className="col-span-1">Submitted By</span>
                  <span className="col-span-1">Reviewed By</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2">Actions</span>
                </div>
                {submittals.filter(s => !search || s.title?.toLowerCase().includes(search.toLowerCase())).map((sub, i) => (
                  <motion.div key={sub.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                    <span className="col-span-1 text-xs text-muted-foreground">{sub.submittal_number}</span>
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-foreground">{sub.title}</p>
                      {sub.description && <p className="text-xs text-muted-foreground truncate">{sub.description}</p>}
                    </div>
                    <span className="col-span-2 text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground truncate">{sub.type}</span>
                    <p className="col-span-1 text-xs text-muted-foreground truncate">{sub.submitted_by || "—"}</p>
                    <p className="col-span-1 text-xs text-foreground truncate">{sub.reviewed_by || "—"}</p>
                    <span className={`col-span-2 text-xs px-2 py-1 rounded-full border w-fit ${getStatusColor(sub.status)}`}>
                      {sub.status?.replace("_", " ")}
                    </span>
                    <div className="col-span-2 flex items-center gap-1">
                      <button onClick={() => openEdit(sub, "submittals")} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(sub.id, "submittals")} title="Delete"
                        disabled={deletingId === sub.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        {deletingId === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
                {submittals.length === 0 && (
                  <div className="text-center py-8">
                    <FileCheck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No submittals</p>
                  </div>
                )}
              </div>
            )}

            {/* Daily Reports */}
            {activeTab === "daily" && (
              <div className="space-y-3">
                {dailyReports.filter(r => !search || r.report_date?.includes(search)).map((report, i) => (
                  <motion.div key={report.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="p-4 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/60 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-foreground">{report.report_date}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          {report.weather} · {report.temperature}°C
                        </span>
                        <span className="text-xs text-muted-foreground">
                          👷 {report.workers_on_site} workers
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-2">{report.created_by}</span>
                        <button onClick={() => openEdit(report, "daily")} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(report.id, "daily")} title="Delete"
                          disabled={deletingId === report.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                          {deletingId === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    {report.work_completed && (
                      <p className="text-xs text-foreground mb-1"><span className="text-muted-foreground">✅ Work: </span>{report.work_completed}</p>
                    )}
                    {report.issues && (
                      <p className="text-xs text-orange-400 mb-1"><span className="text-muted-foreground">⚠️ Issues: </span>{report.issues}</p>
                    )}
                    {report.ai_summary && (
                      <div className="mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <p className="text-xs text-blue-400">🤖 {report.ai_summary}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
                {dailyReports.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No daily reports</p>
                  </div>
                )}
              </div>
            )}

            {/* Meetings */}
            {activeTab === "meetings" && (
              <div className="space-y-3">
                {meetings.filter(m => !search || m.meeting_type?.toLowerCase().includes(search.toLowerCase())).map((meeting, i) => (
                  <motion.div key={meeting.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="p-4 rounded-xl bg-secondary/40 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{meeting.meeting_date}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                          {meeting.meeting_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-2">{meeting.location}</span>
                        <button onClick={() => openEdit(meeting, "meetings")} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(meeting.id, "meetings")} title="Delete"
                          disabled={deletingId === meeting.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                          {deletingId === meeting.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">👥 {meeting.attendees}</p>
                    {meeting.agenda && <p className="text-xs text-foreground mb-1"><span className="text-muted-foreground">📋 Agenda: </span>{meeting.agenda}</p>}
                    {meeting.action_items && (
                      <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                        <p className="text-xs text-orange-400">📌 Actions: {meeting.action_items}</p>
                      </div>
                    )}
                    {meeting.ai_summary && (
                      <div className="mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <p className="text-xs text-blue-400">🤖 {meeting.ai_summary}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
                {meetings.length === 0 && (
                  <div className="text-center py-8">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No meeting minutes</p>
                  </div>
                )}
              </div>
            )}

            {/* Cost Codes */}
            {activeTab === "costcodes" && (
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
                  <span className="col-span-1">Code</span>
                  <span className="col-span-3">Description</span>
                  <span className="col-span-2">Category</span>
                  <span className="col-span-2">Budgeted</span>
                  <span className="col-span-2">Actual</span>
                  <span className="col-span-1">Variance</span>
                  <span className="col-span-1">Actions</span>
                </div>
                {costCodes.filter(c => !search || c.description?.toLowerCase().includes(search.toLowerCase())).map((code, i) => {
                  const variance = code.budgeted_amount - code.actual_amount;
                  return (
                    <motion.div key={code.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                      <span className="col-span-1 text-xs font-mono text-blue-400">{code.code}</span>
                      <p className="col-span-3 text-sm font-medium text-foreground">{code.description}</p>
                      <span className="col-span-2 text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">{code.category || "—"}</span>
                      <p className="col-span-2 text-xs text-foreground">${(code.budgeted_amount / 1000).toFixed(0)}K</p>
                      <p className="col-span-2 text-xs text-foreground">${(code.actual_amount / 1000).toFixed(0)}K</p>
                      <p className={`col-span-1 text-xs font-medium ${variance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {variance >= 0 ? "+" : ""}${(variance / 1000).toFixed(0)}K
                      </p>
                      <div className="col-span-1 flex items-center gap-1">
                        <button onClick={() => openEdit(code, "costcodes")} title="Edit"
                          className="p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(code.id, "costcodes")} title="Delete"
                          className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          {deletingId === code.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
                {costCodes.length === 0 && (
                  <div className="text-center py-8">
                    <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No cost codes</p>
                  </div>
                )}

                {/* Cost Codes Chart */}
                {costCodesChart.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-foreground mb-3">Budget vs Actual by Code</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={costCodesChart} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                        <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                        <Bar dataKey="budget" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Budget ($K)" />
                        <Bar dataKey="actual" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Actual ($K)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>

      <ModuleChat
        context="Construction Management"
        placeholder="Ask about punch list, RFIs, submittals..."
        pageSummaryData={{
          openPunch, openRfi, pendingSubmittals,
          project: selectedProject?.name,
        }}
      />
    </div>
  );
}