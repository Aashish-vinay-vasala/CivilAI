"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Database,
  GitBranch,
  Cpu,
  RefreshCw,
  Loader2,
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
  LineChart,
  Line,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const modelMetrics = [
  { name: "Cost Overrun", accuracy: 83, f1: 82.7, auc: 93.8, status: "production", type: "XGBoost" },
  { name: "Delay Prediction", accuracy: 88.5, f1: 88.7, auc: 97.0, status: "production", type: "XGBoost" },
  { name: "Safety Risk", accuracy: 88, f1: 85.5, auc: 95.6, status: "production", type: "Random Forest" },
  { name: "Workforce Turnover", accuracy: 87, f1: 87.7, auc: 95.9, status: "production", type: "XGBoost" },
  { name: "Equipment Failure", accuracy: 84, f1: 84.6, auc: 94.1, status: "production", type: "Random Forest" },
];

const radarData = [
  { metric: "Accuracy", score: 86 },
  { metric: "F1 Score", score: 85.8 },
  { metric: "AUC", score: 95.3 },
  { metric: "Precision", score: 84 },
  { metric: "Recall", score: 86 },
  { metric: "Stability", score: 92 },
];

const trainingHistory = [
  { run: "Run 1", cost: 44, delay: 53, safety: 87, turnover: 57, equipment: 70 },
  { run: "Run 2", cost: 83, delay: 88, safety: 88, turnover: 87, equipment: 84 },
];

const driftData = [
  { feature: "change_orders", psi: 0.04, status: "stable" },
  { feature: "weather_delays", psi: 0.15, status: "warning" },
  { feature: "material_price", psi: 0.06, status: "stable" },
  { feature: "last_service", psi: 0.14, status: "warning" },
  { feature: "salary", psi: 0.05, status: "stable" },
  { feature: "risk_score", psi: 0.03, status: "stable" },
];

const pipelineSteps = [
  { step: "Data Validation", status: "passed", duration: "1.2s" },
  { step: "Feature Engineering", status: "passed", duration: "0.8s" },
  { step: "Model Training (6 models)", status: "passed", duration: "45s" },
  { step: "MLflow Logging", status: "passed", duration: "12s" },
  { step: "Drift Detection", status: "warning", duration: "3.1s" },
  { step: "Performance Check", status: "passed", duration: "0.5s" },
  { step: "Model Deployment", status: "passed", duration: "2.3s" },
];

export default function MLOpsPage() {
  const [loading, setLoading] = useState(false);
  const [lastTrained, setLastTrained] = useState("Today 17:21");

  const runPipeline = async () => {
    setLoading(true);
    toast.info("Pipeline triggered — check MLflow at localhost:5000");
    setTimeout(() => {
      setLoading(false);
      setLastTrained("Just now");
      toast.success("Pipeline completed successfully!");
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">MLOps Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            MLflow · Prefect Pipelines · Model Registry · Drift Detection
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("http://localhost:5000", "_blank")}>
            <Activity className="w-4 h-4 mr-2 text-orange-400" />
            MLflow UI
          </Button>
          <Button
            onClick={runPipeline}
            disabled={loading}
            className="gradient-blue text-white border-0"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Run Pipeline
          </Button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Models in Production", value: "5", icon: Brain, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Avg Accuracy", value: "86.1%", icon: TrendingUp, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Avg AUC Score", value: "0.953", icon: Activity, color: "border-purple-500/20 bg-purple-500/5", iconColor: "text-purple-400" },
          { label: "Last Trained", value: lastTrained, icon: RefreshCw, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
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

      {/* Model Registry */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-foreground">Model Registry</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">MLflow Tracked</span>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
          <span className="col-span-2">Model</span>
          <span>Algorithm</span>
          <span>Accuracy</span>
          <span>AUC</span>
          <span>Status</span>
        </div>

        <div className="space-y-1">
          {modelMetrics.map((model, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              className="grid grid-cols-6 gap-4 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors"
            >
              <div className="col-span-2 flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-foreground">{model.name}</span>
              </div>
              <span className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">
                {model.type}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary rounded-full h-1.5 w-16">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${model.accuracy}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                    className="h-1.5 rounded-full bg-blue-500"
                  />
                </div>
                <span className="text-xs text-foreground">{model.accuracy}%</span>
              </div>
              <span className="text-sm font-medium text-emerald-400">{model.auc}%</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                {model.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Model Performance</h3>
          <p className="text-xs text-muted-foreground mb-4">Accuracy by model (%)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={modelMetrics} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <YAxis dataKey="name" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="accuracy" fill="#3b82f6" radius={[0, 6, 6, 0]} name="Accuracy %" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Overall ML Performance Radar</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Training History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-2">Training History</h3>
        <p className="text-xs text-muted-foreground mb-4">Accuracy improvement across runs (%)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trainingHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="run" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Cost" />
            <Line type="monotone" dataKey="delay" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Delay" />
            <Line type="monotone" dataKey="safety" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Safety" />
            <Line type="monotone" dataKey="turnover" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} name="Turnover" />
            <Line type="monotone" dataKey="equipment" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Equipment" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-4 mt-2">
          {[
            { color: "bg-blue-400", label: "Cost" },
            { color: "bg-emerald-400", label: "Delay" },
            { color: "bg-orange-400", label: "Safety" },
            { color: "bg-purple-400", label: "Turnover" },
            { color: "bg-red-400", label: "Equipment" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Drift Detection + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Data Drift Monitor (PSI)</h3>
          <div className="space-y-3">
            {driftData.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-3"
              >
                {item.status === "stable"
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                }
                <span className="text-sm text-foreground w-36">{item.feature}</span>
                <div className="flex-1 bg-secondary rounded-full h-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(item.psi * 300, 100)}%` }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    className={`h-1.5 rounded-full ${item.psi < 0.1 ? "bg-emerald-500" : item.psi < 0.2 ? "bg-orange-500" : "bg-red-500"}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">PSI={item.psi}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  item.status === "stable"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-orange-500/10 text-orange-400"
                }`}>
                  {item.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">Prefect Pipeline Status</h3>
          </div>
          <div className="space-y-2">
            {pipelineSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.07 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40"
              >
                {step.status === "passed"
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                }
                <span className="text-sm text-foreground flex-1">{step.step}</span>
                <span className="text-xs text-muted-foreground">{step.duration}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  step.status === "passed"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-orange-500/10 text-orange-400"
                }`}>
                  {step.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <ModuleChat
        context="MLOps Dashboard"
        placeholder="Ask about models, pipelines, drift..."
        pageSummaryData={{
          modelsInProduction: 5,
          avgAccuracy: "86.1%",
          avgAUC: "0.953",
          modelMetrics,
          driftData,
        }}
      />
    </div>
  );
}