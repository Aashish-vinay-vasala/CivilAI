"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const DOCS_TABS = [
  { href: "/documents", label: "Documents" },
  { href: "/contracts", label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
];

const PERMIT_TYPES = [
  "Building Permit",
  "Environmental Clearance",
  "Fire Safety Certificate",
  "Electrical Work Permit",
  "Occupancy Permit",
  "Labor / Work Permit",
  "Safety Permit",
  "Other",
];

const RISK_LEVELS = ["low", "medium", "high"];

interface Permit {
  id?: string;
  name: string;
  type: string;
  status: string;
  expiry_date?: string;
  risk_level: string;
  project_id?: string;
  issued_by?: string;
  created_at?: string;
}

interface Stats {
  compliance_score: number;
  active_permits: number;
  pending_permits: number;
  open_violations: number;
  total_permits: number;
  radar: { category: string; score: number }[];
  trend: { month: string; score: number }[];
}

const EMPTY_STATS: Stats = {
  compliance_score: 0,
  active_permits: 0,
  pending_permits: 0,
  open_violations: 0,
  total_permits: 0,
  radar: [
    { category: "Building Code", score: 0 },
    { category: "Safety", score: 0 },
    { category: "Environmental", score: 0 },
    { category: "Labor", score: 0 },
    { category: "Fire Safety", score: 0 },
    { category: "Electrical", score: 0 },
  ],
  trend: [],
};

export default function CompliancePage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // AI analysis
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");

  // AI permit application generator
  const [permitOpen, setPermitOpen] = useState(false);
  const [permitForm, setPermitForm] = useState({
    project_name: "", project_type: "", location: "",
    owner_name: "", contractor_name: "", permit_type: "",
    estimated_cost: 0, start_date: "", end_date: "",
  });
  const [permitResult, setPermitResult] = useState("");
  const [permitLoading, setPermitLoading] = useState(false);

  // Add permit form
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Permit>({
    name: "", type: "Building Permit", status: "Pending",
    expiry_date: "", risk_level: "medium", issued_by: "",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setDataLoading(true);
    try {
      const [permitsRes, statsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/stats`),
      ]);
      setPermits(permitsRes.data.permits || []);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load compliance data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/analyze`,
        formData
      );
      setAnalysis(response.data.analysis);
      toast.success("Compliance report analyzed!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const generatePermit = async () => {
    setPermitLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permit-application`,
        permitForm
      );
      setPermitResult(response.data.application);
      toast.success("Permit application generated!");
    } catch {
      toast.error("Failed to generate permit");
    } finally {
      setPermitLoading(false);
    }
  };

  const savePermit = async () => {
    if (!addForm.name || !addForm.type) {
      toast.error("Name and type are required");
      return;
    }
    setAddLoading(true);
    try {
      const payload: Permit = { ...addForm };
      if (!payload.expiry_date) delete payload.expiry_date;
      if (!payload.issued_by) delete payload.issued_by;
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits`, payload);
      toast.success("Permit saved!");
      setAddOpen(false);
      setAddForm({ name: "", type: "Building Permit", status: "Pending", expiry_date: "", risk_level: "medium", issued_by: "" });
      fetchAll();
    } catch {
      toast.error("Failed to save permit");
    } finally {
      setAddLoading(false);
    }
  };

  const updateStatus = async (permit: Permit, newStatus: string) => {
    if (!permit.id) return;
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/${permit.id}`,
        { status: newStatus }
      );
      toast.success("Status updated");
      fetchAll();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const deletePermit = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/${id}`);
      toast.success("Permit deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "Pending": return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const kpis = [
    { label: "Compliance Score", value: `${stats.compliance_score}%`, icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
    { label: "Active Permits", value: stats.active_permits.toString(), icon: ClipboardCheck, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
    { label: "Pending Permits", value: stats.pending_permits.toString(), icon: Clock, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
    { label: "Open Violations", value: stats.open_violations.toString(), icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered compliance & permit management
            {stats.total_permits > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {stats.total_permits} permits in database
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={dataLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${dataLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setAddOpen(!addOpen)}>
            <Plus className="w-4 h-4 mr-2 text-emerald-400" />
            Add Permit
          </Button>
          <Button variant="outline" onClick={() => setPermitOpen(!permitOpen)}>
            <FileText className="w-4 h-4 mr-2 text-blue-400" />
            Generate Application
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Report
            </Button>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      {dataLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border p-5 bg-card animate-pulse">
              <div className="h-4 bg-secondary rounded w-2/3 mb-3" />
              <div className="h-8 bg-secondary rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -2 }}
              className={`rounded-2xl border p-5 ${kpi.color}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Permit Form */}
      {addOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-emerald-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Add Permit to Register</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              placeholder="Permit name *"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select
              value={addForm.type}
              onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PERMIT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select
              value={addForm.status}
              onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {["Pending", "Approved", "Rejected"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select
              value={addForm.risk_level}
              onChange={(e) => setAddForm({ ...addForm, risk_level: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {RISK_LEVELS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input
              type="date"
              placeholder="Expiry date"
              value={addForm.expiry_date || ""}
              onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              placeholder="Issued by"
              value={addForm.issued_by || ""}
              onChange={(e) => setAddForm({ ...addForm, issued_by: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={savePermit} disabled={addLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
              {addLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Save Permit
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </motion.div>
      )}

      {/* AI Permit Application Generator */}
      {permitOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI Permit Application Generator</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { placeholder: "Project name", key: "project_name" },
              { placeholder: "Project type", key: "project_type" },
              { placeholder: "Location", key: "location" },
              { placeholder: "Permit type", key: "permit_type" },
              { placeholder: "Owner name", key: "owner_name" },
              { placeholder: "Contractor name", key: "contractor_name" },
            ].map((f) => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={permitForm[f.key as keyof typeof permitForm] as string}
                onChange={(e) => setPermitForm({ ...permitForm, [f.key]: e.target.value })}
                className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ))}
          </div>
          <Button onClick={generatePermit} disabled={permitLoading} className="gradient-blue text-white border-0">
            {permitLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate Application
          </Button>
          {permitResult && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{permitResult}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-1">Compliance Radar</h3>
          <p className="text-xs text-muted-foreground mb-4">Score by permit category</p>
          {dataLoading ? (
            <div className="h-52 bg-secondary/30 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={stats.radar}>
                <PolarGrid stroke="#ffffff08" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Radar dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-1">Compliance Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly approval rate</p>
          {dataLoading ? (
            <div className="h-52 bg-secondary/30 rounded-xl animate-pulse" />
          ) : stats.trend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              No trend data yet — add permits to see monthly trends
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.trend}>
                <defs>
                  <linearGradient id="compliance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                  formatter={(v: number) => [`${v}%`, "Approval Rate"]}
                />
                <Area type="monotone" dataKey="score" stroke="#10b981" fill="url(#compliance)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Permit Register */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Permit Register</h3>
          {permits.length > 0 && (
            <span className="text-xs text-muted-foreground">{permits.length} permits</span>
          )}
        </div>

        {dataLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-secondary/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : permits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No permits tracked yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Permit" to start tracking permits</p>
          </div>
        ) : (
          <div className="space-y-2">
            {permits.map((permit, i) => (
              <motion.div
                key={permit.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group"
              >
                {getStatusIcon(permit.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{permit.name}</p>
                  <p className="text-xs text-muted-foreground">{permit.type}</p>
                </div>
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {permit.expiry_date ? `Expiry: ${permit.expiry_date}` : "No expiry"}
                </span>
                {/* Status changer */}
                <select
                  value={permit.status}
                  onChange={(e) => updateStatus(permit, e.target.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    permit.status === "Approved"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : permit.status === "Rejected"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-orange-500/10 text-orange-400"
                  }`}
                >
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                </select>
                <span className={`text-xs px-2 py-0.5 rounded-full hidden sm:block ${
                  permit.risk_level === "high"
                    ? "bg-red-500/10 text-red-400"
                    : permit.risk_level === "medium"
                    ? "bg-orange-500/10 text-orange-400"
                    : "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {permit.risk_level}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                  onClick={() => permit.id && deletePermit(permit.id)}
                  disabled={deletingId === permit.id}
                >
                  {deletingId === permit.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* AI Analysis result */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Compliance Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Compliance & Permits"
        placeholder="Ask about permits, violations, regulations..."
        pageSummaryData={{
          complianceScore: `${stats.compliance_score}%`,
          activePermits: stats.active_permits,
          pendingPermits: stats.pending_permits,
          openViolations: stats.open_violations,
          permits,
          radarData: stats.radar,
        }}
      />
    </div>
  );
}
