"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileSignature,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  ShieldAlert,
  TrendingUp,
  Calculator,
  ChevronRight,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { MarkdownText } from "@/lib/renderMarkdown";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const clauseRiskData = [
  { category: "Payment", risk: 75 },
  { category: "Liability", risk: 88 },
  { category: "Penalties", risk: 65 },
  { category: "Termination", risk: 45 },
  { category: "IP Rights", risk: 55 },
  { category: "Disputes", risk: 82 },
];

const recentContracts = [
  { name: "Main Contractor Agreement", risk: "High", score: 7.8, status: "Review", value: "$12.5M" },
  { name: "Steel Supply Contract", risk: "Medium", score: 5.2, status: "Approved", value: "$2.1M" },
  { name: "Subcontractor - MEP", risk: "Low", score: 3.1, status: "Approved", value: "$890K" },
  { name: "Equipment Lease", risk: "Medium", score: 4.8, status: "Review", value: "$450K" },
  { name: "Consulting Agreement", risk: "Low", score: 2.9, status: "Approved", value: "$180K" },
];

interface RiskData {
  risk_score: number;
  risk_level: "Low" | "Medium" | "High";
  top_risks: string[];
  dispute_probability: string;
}

export default function ContractsPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [requiresReview, setRequiresReview] = useState(false);
  const [analysisFilename, setAnalysisFilename] = useState("");
  const [rfiOpen, setRfiOpen] = useState(false);
  const [rfi, setRfi] = useState({ issue: "", project_context: "" });
  const [rfiResult, setRfiResult] = useState("");
  const [rfiLoading, setRfiLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setAnalysis("");
    setRiskData(null);
    setRequiresReview(false);
    setAnalysisFilename(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts/analyze`,
        formData
      );
      setAnalysis(response.data.analysis || "");
      if (response.data.risk_data) setRiskData(response.data.risk_data);
      setRequiresReview(response.data.requires_review || false);
      toast.success("Contract analyzed!");
    } catch {
      toast.error("Failed to analyze contract");
    } finally {
      setLoading(false);
    }
  };

  const generateRFI = async () => {
    setRfiLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts/rfi`,
        rfi
      );
      setRfiResult(response.data.rfi);
      toast.success("RFI generated!");
    } catch {
      toast.error("Failed to generate RFI");
    } finally {
      setRfiLoading(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "High": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "Medium": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contracts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered contract intelligence & risk analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRfiOpen(!rfiOpen)}>
            <FileText className="w-4 h-4 mr-2 text-blue-400" />
            Generate RFI
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Analyze Contract
            </Button>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Contracts", value: "15", icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "High Risk", value: "3", icon: XCircle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
          { label: "Expiring Soon", value: "2", icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          {
            label: "Last Risk Score",
            value: riskData ? `${riskData.risk_score.toFixed(1)}/10` : "—",
            icon: FileSignature,
            color: riskData
              ? riskData.risk_level === "High"
                ? "border-red-500/20 bg-red-500/5"
                : riskData.risk_level === "Medium"
                ? "border-orange-500/20 bg-orange-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
              : "border-blue-500/20 bg-blue-500/5",
            iconColor: riskData
              ? riskData.risk_level === "High" ? "text-red-400"
              : riskData.risk_level === "Medium" ? "text-orange-400"
              : "text-emerald-400"
              : "text-blue-400",
          },
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

      {/* RFI Form */}
      {rfiOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI RFI Generator</h3>
          <div className="space-y-3 mb-4">
            <textarea
              placeholder="Describe the issue requiring clarification..."
              value={rfi.issue}
              onChange={(e) => setRfi({ ...rfi, issue: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <textarea
              placeholder="Project context (name, phase, contractor...)"
              value={rfi.project_context}
              onChange={(e) => setRfi({ ...rfi, project_context: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <Button onClick={generateRFI} disabled={rfiLoading} className="gradient-blue text-white border-0">
            {rfiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate RFI
          </Button>
          {rfiResult && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <MarkdownText text={rfiResult} className="text-sm text-foreground leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Clause Risk + Contracts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Clause Risk Radar</h3>
          <p className="text-xs text-muted-foreground mb-4">Risk score by contract clause type</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={clauseRiskData}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="risk" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
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
          <h3 className="font-semibold text-foreground mb-4">Risk by Clause</h3>
          <div className="space-y-3">
            {clauseRiskData.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-20">{item.category}</span>
                <div className="flex-1 bg-secondary rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.risk}%` }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                    className={`h-2 rounded-full ${item.risk > 80 ? "bg-red-500" : item.risk > 60 ? "bg-orange-500" : "bg-emerald-500"}`}
                  />
                </div>
                <span className={`text-xs font-medium w-8 text-right ${item.risk > 80 ? "text-red-400" : item.risk > 60 ? "text-orange-400" : "text-emerald-400"}`}>
                  {item.risk}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Contracts List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Contract Register</h3>
        <div className="space-y-2">
          {recentContracts.map((contract, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors cursor-pointer"
            >
              <FileSignature className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{contract.name}</p>
                <p className="text-xs text-muted-foreground">Value: {contract.value}</p>
              </div>
              <span className="text-sm text-muted-foreground">Score: {contract.score}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getRiskBadge(contract.risk)}`}>
                {contract.risk}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                contract.status === "Approved"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-orange-500/10 text-orange-400"
              }`}>
                {contract.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {(analysis || riskData) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* HITL review banner */}
          {requiresReview && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-orange-500/10 border border-orange-500/30">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-sm text-orange-300 flex-1">
                High-risk contract flagged for human review — a project director or admin will review this before approval.
              </p>
            </div>
          )}

          {/* Structured risk panel */}
          {riskData && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-foreground">AI Risk Assessment</h3>
                  {analysisFilename && (
                    <span className="text-xs text-muted-foreground truncate max-w-48">{analysisFilename}</span>
                  )}
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  riskData.risk_level === "High"
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : riskData.risk_level === "Medium"
                    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}>
                  {riskData.risk_level} Risk
                </span>
              </div>

              {/* Score + dispute probability */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Risk Score</p>
                  <p className="text-3xl font-bold text-foreground">{riskData.risk_score.toFixed(1)}<span className="text-base font-normal text-muted-foreground">/10</span></p>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${riskData.risk_score * 10}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        riskData.risk_score >= 7 ? "bg-red-500"
                        : riskData.risk_score >= 5 ? "bg-orange-500"
                        : "bg-emerald-500"
                      }`}
                    />
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Dispute Probability</p>
                  <div className="flex items-end gap-1">
                    <TrendingUp className="w-4 h-4 text-orange-400 mb-1" />
                    <p className="text-3xl font-bold text-foreground">{riskData.dispute_probability}</p>
                  </div>
                </div>
              </div>

              {/* Top risks */}
              {riskData.top_risks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Top Risk Factors</p>
                  <ul className="space-y-1.5">
                    {riskData.top_risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          i === 0 ? "bg-red-400" : i === 1 ? "bg-orange-400" : "bg-yellow-400"
                        }`} />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cross-link to Accounting */}
              <a
                href="/accounting"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors pt-1 border-t border-border"
              >
                <Calculator className="w-3.5 h-3.5" />
                Extract financial terms from this contract in Accounting Extract
                <ChevronRight className="w-3.5 h-3.5 ml-auto" />
              </a>
            </div>
          )}

          {/* Full analysis text */}
          {analysis && (
            <div className="bg-card border border-blue-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileSignature className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-foreground">Detailed Analysis</h3>
              </div>
              <MarkdownText text={analysis} className="text-sm text-muted-foreground leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      <ModuleChat
        context="Contract Intelligence"
        placeholder="Ask about contracts, risks, disputes..."
        pageSummaryData={{
          activeContracts: 15,
          highRisk: 3,
          expiringSoon: 2,
          avgRiskScore: "4.8/10",
          contracts: recentContracts,
          clauseRisks: clauseRiskData,
        }}
      />
    </div>
  );
}