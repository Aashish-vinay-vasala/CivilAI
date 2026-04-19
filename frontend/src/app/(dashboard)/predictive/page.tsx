"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, DollarSign, Calendar, Shield,
  Wrench, Loader2, RefreshCw, Sparkles,
} from "lucide-react";
import axios from "axios";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";

export default function PredictivePage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<{ [key: string]: any }>({});
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [riskTimeline, setRiskTimeline] = useState<any[]>([]);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (projectId) runPredictions(); }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const runPredictions = async () => {
    setLoading(true);
    try {
      const [tasksRes, equipRes, safetyRes, workforceRes, projectRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/safety`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/workforce`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}`),
      ]);

      const tasks = tasksRes.data.tasks || [];
      const equipment = equipRes.data.equipment || [];
      const incidents = safetyRes.data.incidents || [];
      const workforce = workforceRes.data.workforce || [];
      const project = projectRes.data.project;
      setSelectedProject(project);

      const avgDelay = tasks.reduce((s: number, t: any) => s + (t.delay_days || 0), 0) / Math.max(tasks.length, 1);

      const [costRes, delayRes, safetyMLRes, equipMLRes, turnoverRes] = await Promise.all([
        axios.post("http://localhost:8001/predict/cost-overrun", {
          project_type: "Commercial", duration_months: 18,
          team_size: workforce.length || 20, change_orders: Math.round(avgDelay / 5),
          material_price_increase: 8, weather_impact_days: 10, subcontractor_count: 5,
        }).catch(() => ({ data: null })),
        axios.post("http://localhost:8001/predict/delay", {
          project_type: "Commercial", planned_duration_days: 180,
          weather_delays: 10, labor_shortage: workforce.length < 10 ? 1 : 0,
          material_delays: 1, design_changes: Math.round(avgDelay / 3), subcontractor_issues: 1,
        }).catch(() => ({ data: null })),
        axios.post("http://localhost:8001/predict/safety", {
          project_type: "Commercial", workers_count: workforce.length || 20,
          height_work: 1, equipment_usage: equipment.length,
          ppe_compliance_rate: 0.9, safety_training_hours: 8, previous_incidents: incidents.length,
        }).catch(() => ({ data: null })),
        axios.post("http://localhost:8001/predict/equipment", {
          equipment_type: "Crane", age_years: 5, operating_hours: 3000,
          last_service_days: 90, utilization_rate: 0.8,
          maintenance_score: equipment.reduce((s: number, e: any) => s + (e.health_score || 80), 0) / Math.max(equipment.length, 1) / 100,
        }).catch(() => ({ data: null })),
        axios.post("http://localhost:8001/predict/turnover", {
          role: "Engineer", experience_years: 5, salary: 80000,
          overtime_hours: 10, job_satisfaction: 3.5, commute_distance: 20, last_promotion_months: 18,
        }).catch(() => ({ data: null })),
      ]);

      const newPredictions = {
        cost: costRes.data,
        delay: delayRes.data,
        safety: safetyMLRes.data,
        equipment: equipMLRes.data,
        turnover: turnoverRes.data,
      };
      setPredictions(newPredictions);

      // Cost Forecast
      const budget = project?.total_budget || 5000000;
      const spent = project?.spent_to_date || budget * 0.4;
      const spendRate = spent / 6;
      const forecast = Array.from({ length: 12 }, (_, i) => {
        const month = new Date(2024, i, 1).toLocaleDateString("en", { month: "short" });
        const planned = Math.round(budget * ((i + 1) / 12) / 1000);
        const actual = i <= 5 ? Math.round((spent + spendRate * (i - 5)) / 1000) : null;
        const predicted = i >= 5 ? Math.round((spent + spendRate * (1 + (costRes.data?.will_overrun ? 0.12 : 0.02)) * (i - 5)) / 1000) : null;
        return { month, planned, actual, predicted };
      });
      setForecastData(forecast);

      // Risk Timeline
      const baseRisks = {
        cost: newPredictions.cost?.probability || 50,
        schedule: newPredictions.delay?.probability || 40,
        safety: newPredictions.safety?.probability || 20,
        equipment: newPredictions.equipment?.probability || 30,
      };
      const riskData = Array.from({ length: 6 }, (_, i) => ({
        month: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000)
          .toLocaleDateString("en", { month: "short" }),
        costRisk: Math.min(99, Math.round(baseRisks.cost + i * 2)),
        scheduleRisk: Math.min(99, Math.round(baseRisks.schedule + i * 1.5)),
        safetyRisk: Math.min(99, Math.round(baseRisks.safety + i * 0.5)),
        equipmentRisk: Math.min(99, Math.round(baseRisks.equipment + i * 2.5)),
      }));
      setRiskTimeline(riskData);

    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getRiskColor = (prob: number) => {
    if (prob > 70) return "text-red-400";
    if (prob > 50) return "text-orange-400";
    if (prob > 30) return "text-yellow-400";
    return "text-emerald-400";
  };

  const getRiskBg = (prob: number) => {
    if (prob > 70) return "border-red-500/30 bg-red-500/5";
    if (prob > 50) return "border-orange-500/30 bg-orange-500/5";
    if (prob > 30) return "border-yellow-500/30 bg-yellow-500/5";
    return "border-emerald-500/30 bg-emerald-500/5";
  };

  const hasPredictions = Object.keys(predictions).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Predictive Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            5 ML models · Cost · Delay · Safety · Equipment · Turnover forecasts
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={runPredictions} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? "Predicting..." : "Run Predictions"}
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
          <p className="text-muted-foreground">Running 5 ML models on your project data...</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {["Cost Overrun", "Delay", "Safety Risk", "Equipment Failure", "Turnover"].map(m => (
              <span key={m} className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 animate-pulse">{m}</span>
            ))}
          </div>
        </div>
      ) : hasPredictions ? (
        <>
          {/* ML Prediction Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {[
              { key: "cost", label: "Cost Overrun", icon: DollarSign, prob: predictions.cost?.probability, detail: predictions.cost?.will_overrun ? `+${predictions.cost?.estimated_overrun_pct?.toFixed(1)}% overrun` : "Within budget" },
              { key: "delay", label: "Schedule Delay", icon: Calendar, prob: predictions.delay?.probability, detail: predictions.delay?.will_be_delayed ? "Delay likely" : "On schedule" },
              { key: "safety", label: "Safety Risk", icon: Shield, prob: predictions.safety?.probability, detail: predictions.safety?.severe_risk ? "High severity risk" : "Manageable risk" },
              { key: "equipment", label: "Equipment Failure", icon: Wrench, prob: predictions.equipment?.probability, detail: predictions.equipment?.will_fail ? "Service needed" : "Operating well" },
              { key: "turnover", label: "Staff Turnover", icon: Brain, prob: predictions.turnover?.probability, detail: predictions.turnover?.will_leave ? "Retention risk" : "Staff stable" },
            ].map((pred, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
                className={`rounded-2xl border p-4 ${getRiskBg(pred.prob || 0)}`}>
                <div className="flex items-center justify-between mb-3">
                  <pred.icon className={`w-5 h-5 ${getRiskColor(pred.prob || 0)}`} />
                  <span className={`text-xs font-bold ${getRiskColor(pred.prob || 0)}`}>
                    {predictions[pred.key]?.risk_level || "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{pred.label}</p>
                <p className={`text-3xl font-bold ${getRiskColor(pred.prob || 0)}`}>
                  {pred.prob?.toFixed(0) || 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{pred.detail}</p>
                <div className="mt-2 bg-secondary/50 rounded-full h-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pred.prob || 0}%` }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.8 }}
                    className={`h-1.5 rounded-full ${
                      (pred.prob || 0) > 70 ? "bg-red-500" :
                      (pred.prob || 0) > 50 ? "bg-orange-500" :
                      (pred.prob || 0) > 30 ? "bg-yellow-500" : "bg-emerald-500"
                    }`}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* AI Insight Banner */}
          <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  AI Forecast — {selectedProject?.name}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {predictions.cost?.will_overrun ? "⚠️ Cost overrun predicted. " : "✅ Cost within budget. "}
                  {predictions.delay?.will_be_delayed ? "⚠️ Schedule delay likely. " : "✅ Schedule on track. "}
                  {predictions.safety?.severe_risk ? "🚨 Safety intervention needed. " : "✅ Safety manageable. "}
                  {predictions.equipment?.will_fail ? "🔧 Equipment service required. " : "✅ Equipment operating well. "}
                  Overall project risk:{" "}
                  <span className={`font-semibold ${getRiskColor(
                    Math.max(
                      predictions.cost?.probability || 0,
                      predictions.delay?.probability || 0,
                      predictions.safety?.probability || 0,
                    )
                  )}`}>
                    {predictions.cost?.risk_level || "Medium"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost Forecast */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Cost Forecast</h3>
              <p className="text-xs text-muted-foreground mb-4">Planned · Actual · AI Predicted ($K)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={forecastData}>
                  <defs>
                    <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="predictedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="planned" stroke="#3b82f6" fill="url(#plannedGrad)" strokeWidth={2} name="Planned ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="actual" stroke="#10b981" fill="url(#actualGrad)" strokeWidth={2} name="Actual ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="predicted" stroke="#ef4444" fill="url(#predictedGrad)" strokeWidth={2} strokeDasharray="5 5" name="AI Predicted ($K)" connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {[
                  { color: "bg-blue-400", label: "Planned" },
                  { color: "bg-emerald-400", label: "Actual" },
                  { color: "bg-red-400", label: "AI Predicted" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${l.color}`} />
                    <span className="text-xs text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Risk Timeline */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Risk Score Timeline</h3>
              <p className="text-xs text-muted-foreground mb-4">6-month risk forecast by category (%)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={riskTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <ReferenceLine y={50} stroke="#ffffff20" strokeDasharray="3 3" label={{ value: "50%", fill: "#6b7280", fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="costRisk" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} name="Cost Risk %" />
                  <Line type="monotone" dataKey="scheduleRisk" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} name="Schedule Risk %" />
                  <Line type="monotone" dataKey="safetyRisk" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} name="Safety Risk %" />
                  <Line type="monotone" dataKey="equipmentRisk" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} name="Equipment Risk %" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { color: "bg-red-400", label: "Cost" },
                  { color: "bg-orange-400", label: "Schedule" },
                  { color: "bg-blue-400", label: "Safety" },
                  { color: "bg-purple-400", label: "Equipment" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${l.color}`} />
                    <span className="text-xs text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Recommendations */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">AI Recommendations</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[
                predictions.cost?.will_overrun && {
                  icon: "💰", title: "Cost Control Alert",
                  desc: `${predictions.cost?.estimated_overrun_pct?.toFixed(1)}% overrun predicted. Review procurement and change orders immediately.`,
                  color: "border-red-500/30 bg-red-500/5",
                },
                predictions.delay?.will_be_delayed && {
                  icon: "📅", title: "Schedule Recovery",
                  desc: "Delay predicted. Add resources or fast-track critical path activities.",
                  color: "border-orange-500/30 bg-orange-500/5",
                },
                predictions.safety?.severe_risk && {
                  icon: "🦺", title: "Safety Intervention",
                  desc: "High safety risk. Conduct site audit and toolbox talks immediately.",
                  color: "border-red-500/30 bg-red-500/5",
                },
                predictions.equipment?.will_fail && {
                  icon: "🔧", title: "Equipment Maintenance",
                  desc: "Failure risk high. Schedule preventive maintenance immediately.",
                  color: "border-orange-500/30 bg-orange-500/5",
                },
                predictions.turnover?.will_leave && {
                  icon: "👥", title: "Staff Retention",
                  desc: "High turnover risk. Review compensation and workload distribution.",
                  color: "border-yellow-500/30 bg-yellow-500/5",
                },
                !predictions.cost?.will_overrun && !predictions.delay?.will_be_delayed && {
                  icon: "✅", title: "Project Health Good",
                  desc: "Project performing well. Continue monitoring KPIs and maintain current pace.",
                  color: "border-emerald-500/30 bg-emerald-500/5",
                },
              ].filter(Boolean).map((rec: any, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${rec.color}`}>
                  <span className="text-2xl flex-shrink-0">{rec.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{rec.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        <div className="text-center py-20">
          <Brain className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Ready to Predict</p>
          <p className="text-sm text-muted-foreground mb-6">
            Select a project and run ML predictions
          </p>
          <button onClick={runPredictions}
            className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
            <Brain className="w-4 h-4" />
            Run Predictions
          </button>
        </div>
      )}

      <ModuleChat
        context="Predictive Analytics"
        placeholder="Ask about forecasts, risk predictions..."
        pageSummaryData={{ predictions, project: selectedProject?.name }}
      />
    </div>
  );
}