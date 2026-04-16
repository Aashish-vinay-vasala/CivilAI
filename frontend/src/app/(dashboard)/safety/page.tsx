"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Upload,
  Loader2,
  XCircle,
  Brain,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const defaultIncidentData = [
  { month: "Jan", incidents: 3, nearMiss: 8 },
  { month: "Feb", incidents: 2, nearMiss: 6 },
  { month: "Mar", incidents: 4, nearMiss: 10 },
  { month: "Apr", incidents: 1, nearMiss: 5 },
  { month: "May", incidents: 2, nearMiss: 7 },
  { month: "Jun", incidents: 0, nearMiss: 4 },
];

const radarData = [
  { category: "PPE", score: 88 },
  { category: "Fall", score: 72 },
  { category: "Electrical", score: 91 },
  { category: "Fire", score: 85 },
  { category: "Equipment", score: 78 },
  { category: "Chemical", score: 65 },
];

const kpis = [
  { label: "Safety Score", value: "94/100", status: "good", icon: CheckCircle },
  { label: "Days Without Incident", value: "28", status: "good", icon: Shield },
  { label: "Open Violations", value: "3", status: "warning", icon: AlertTriangle },
  { label: "PPE Compliance", value: "94%", status: "good", icon: CheckCircle },
];

export default function SafetyPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [incidentForm, setIncidentForm] = useState(false);
  const [incident, setIncident] = useState({
    type: "", location: "", date: "", description: "", injured: "None",
  });
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [safetyStats, setSafetyStats] = useState<any>(null);
  const [mlSafety, setMlSafety] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);

  useEffect(() => {
    fetchSafetyData();
  }, []);

  const fetchSafetyData = async () => {
    setMlLoading(true);
    try {
      const statsRes = await axios.get(
        "http://localhost:8000/api/v1/ml/safety-stats"
      );
      setSafetyStats(statsRes.data);

      const mlRes = await axios.post(
        "http://localhost:8000/api/v1/ml/safety-risk",
        {
          incident_type: "Fall",
          zone: "Zone A",
          workers_involved: 3,
          ppe_worn: 0,
          training_completed: 1,
          near_miss: 1,
          month: 6,
        }
      );
      setMlSafety(mlRes.data);
    } catch (err) {
      console.error("Failed to fetch safety data", err);
    } finally {
      setMlLoading(false);
    }
  };

  const zoneRisks = safetyStats?.zone_risk_scores
    ? Object.entries(safetyStats.zone_risk_scores).map(([zone, risk]: any) => ({
        zone,
        risk: Math.round(risk),
      }))
    : [
        { zone: "Zone A", risk: 85 },
        { zone: "Zone B", risk: 45 },
        { zone: "Zone C", risk: 72 },
        { zone: "Zone D", risk: 30 },
        { zone: "Zone E", risk: 91 },
      ];

  const incidentData = safetyStats?.monthly_incidents
    ? safetyStats.monthly_incidents.slice(0, 6).map((item: any) => ({
        month: `${item.year}-${item.month}`,
        incidents: item.incidents,
        nearMiss: Math.round(item.incidents * 2.5),
      }))
    : defaultIncidentData;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        "http://localhost:8000/api/v1/safety/analyze-report",
        formData
      );
      setAnalysis(response.data.analysis);
      toast.success("Safety report analyzed!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/safety/incident-report",
        incident
      );
      setReport(response.data.report);
      toast.success("Incident report generated!");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportLoading(false);
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
          <h1 className="text-3xl font-bold text-foreground">Safety & Risk</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered safety monitoring & incident management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIncidentForm(!incidentForm)}>
            <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" />
            Report Incident
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Audit
            </Button>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${
              kpi.status === "good"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-orange-500/20 bg-orange-500/5"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.status === "good" ? "text-emerald-400" : "text-orange-400"}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ML Prediction */}
      {mlLoading ? (
        <div className="rounded-2xl border border-border p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">Loading AI safety prediction...</p>
        </div>
      ) : mlSafety && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlSafety.risk_level === "High"
              ? "border-red-500/30 bg-red-500/5"
              : mlSafety.risk_level === "Medium"
              ? "border-orange-500/30 bg-orange-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Safety Risk Prediction</p>
                <p className="text-xl font-bold text-foreground">
                  {mlSafety.probability}% severe incident probability
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlSafety.severe_risk ? "Immediate action required" : "Risk under control"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlSafety.risk_level === "High"
                ? "bg-red-500/10 text-red-400"
                : mlSafety.risk_level === "Medium"
                ? "bg-orange-500/10 text-orange-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlSafety.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Incident Form */}
      {incidentForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-orange-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI Incident Report Generator</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { placeholder: "Incident type", key: "type" },
              { placeholder: "Location (Zone/Area)", key: "location" },
              { placeholder: "Injured (if any)", key: "injured" },
            ].map((f) => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={incident[f.key as keyof typeof incident]}
                onChange={(e) => setIncident({ ...incident, [f.key]: e.target.value })}
                className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ))}
            <input
              type="date"
              value={incident.date}
              onChange={(e) => setIncident({ ...incident, date: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Describe what happened..."
              value={incident.description}
              onChange={(e) => setIncident({ ...incident, description: e.target.value })}
              rows={3}
              className="col-span-2 px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <Button onClick={generateReport} disabled={reportLoading} className="gradient-blue text-white border-0">
            {reportLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
            Generate OSHA Report
          </Button>
          {report && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{report}</p>
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Incident Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Incidents vs Near-Miss
                {safetyStats && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={incidentData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="incidents" fill="#ef4444" radius={[6, 6, 0, 0]} name="Incidents" />
              <Bar dataKey="nearMiss" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Near Miss" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Incidents</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Near Miss</span></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Safety Compliance</h3>
          <p className="text-xs text-muted-foreground mb-4">Score by category</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Zone Risk */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-foreground">Zone Risk Heatmap</h3>
          {safetyStats && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              Live Data — {safetyStats.total_incidents} total incidents
            </span>
          )}
        </div>
        <div className="space-y-4">
          {zoneRisks.map((zone, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="text-sm text-foreground w-16">{zone.zone}</span>
              <div className="flex-1 bg-secondary rounded-full h-2.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${zone.risk}%` }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                  className={`h-2.5 rounded-full ${
                    zone.risk > 80 ? "bg-red-500" : zone.risk > 60 ? "bg-orange-500" : "bg-emerald-500"
                  }`}
                />
              </div>
              <span className={`text-sm font-medium w-10 text-right ${
                zone.risk > 80 ? "text-red-400" : zone.risk > 60 ? "text-orange-400" : "text-emerald-400"
              }`}>
                {zone.risk}%
              </span>
            </div>
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
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Safety Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Safety & Risk"
        placeholder="Ask about safety, incidents, compliance..."
        pageSummaryData={{
          safetyScore: "94/100",
          daysWithoutIncident: 28,
          openViolations: 3,
          ppeCompliance: "94%",
          mlPrediction: mlSafety,
          zoneRisks,
          totalIncidents: safetyStats?.total_incidents,
        }}
      />
    </div>
  );
}