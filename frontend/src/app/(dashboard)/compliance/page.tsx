"use client";

import { useState } from "react";
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

const complianceRadar = [
  { category: "Building Code", score: 88 },
  { category: "Safety", score: 92 },
  { category: "Environmental", score: 75 },
  { category: "Labor", score: 85 },
  { category: "Fire Safety", score: 90 },
  { category: "Electrical", score: 78 },
];

const complianceTrend = [
  { month: "Jan", score: 78 },
  { month: "Feb", score: 82 },
  { month: "Mar", score: 79 },
  { month: "Apr", score: 85 },
  { month: "May", score: 88 },
  { month: "Jun", score: 91 },
];

const permits = [
  { name: "Building Permit — Phase 1", status: "Approved", expiry: "Dec 2026", risk: "low" },
  { name: "Environmental Clearance", status: "Approved", expiry: "Jun 2026", risk: "medium" },
  { name: "Fire Safety Certificate", status: "Pending", expiry: "N/A", risk: "high" },
  { name: "Electrical Work Permit", status: "Approved", expiry: "Mar 2027", risk: "low" },
  { name: "Occupancy Permit", status: "Pending", expiry: "N/A", risk: "high" },
];

export default function CompliancePage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [permitOpen, setPermitOpen] = useState(false);
  const [permitForm, setPermitForm] = useState({
    project_name: "", project_type: "", location: "",
    owner_name: "", contractor_name: "", permit_type: "",
    estimated_cost: 0, start_date: "", end_date: "",
  });
  const [permitResult, setPermitResult] = useState("");
  const [permitLoading, setPermitLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        "http://localhost:8000/api/v1/compliance/analyze",
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
        "http://localhost:8000/api/v1/compliance/permit-application",
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "Pending": return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered compliance & permit management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPermitOpen(!permitOpen)}>
            <FileText className="w-4 h-4 mr-2 text-blue-400" />
            Generate Permit
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Compliance Score", value: "91%", icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Active Permits", value: "12", icon: ClipboardCheck, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Pending Permits", value: "4", icon: Clock, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          { label: "Open Violations", value: "1", icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
        ].map((kpi, i) => (
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

      {/* Permit Form */}
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
          <h3 className="font-semibold text-foreground mb-2">Compliance Radar</h3>
          <p className="text-xs text-muted-foreground mb-4">Score by category</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={complianceRadar}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Compliance Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly score %</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={complianceTrend}>
              <defs>
                <linearGradient id="compliance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Area type="monotone" dataKey="score" stroke="#10b981" fill="url(#compliance)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Permit Register */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Permit Register</h3>
        <div className="space-y-2">
          {permits.map((permit, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              {getStatusIcon(permit.status)}
              <p className="text-sm text-foreground flex-1">{permit.name}</p>
              <span className="text-xs text-muted-foreground">Expiry: {permit.expiry}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                permit.status === "Approved"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-orange-500/10 text-orange-400"
              }`}>
                {permit.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Compliance & Permits"
        placeholder="Ask about permits, violations, regulations..."
        pageSummaryData={{
          complianceScore: "91%",
          activePermits: 12,
          pendingPermits: 4,
          openViolations: 1,
          permits,
          complianceRadar,
        }}
      />
    </div>
  );
}