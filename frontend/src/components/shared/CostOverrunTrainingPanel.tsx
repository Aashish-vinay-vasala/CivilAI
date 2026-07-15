"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Database, Upload, Loader2, Check, X, History, RotateCcw, AlertTriangle, CheckCircle2,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import GlassModal from "@/components/shared/GlassModal";
import { ACCENT, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";

const API = process.env.NEXT_PUBLIC_API_URL;

interface DatasetValidation {
  dataset_id: string | null;
  filename: string;
  row_count: number;
  column_mapping: Record<string, string>;
  matched_columns: string[];
  missing_columns: string[];
  errors: string[];
  warnings: string[];
  preview: Record<string, any>[];
}

interface DatasetSource {
  type: "baseline" | "real_projects" | "uploaded";
  rows: number;
  file?: string;
  filename?: string;
  dataset_id?: string;
}

interface TrainingRun {
  id: string;
  version: number;
  is_active: boolean;
  is_baseline_only: boolean;
  dataset_sources: DatasetSource[];
  total_rows: number;
  metrics: {
    cv_accuracy_mean?: number;
    cv_f1_mean?: number;
    cv_roc_auc_mean?: number;
    regression_r2_p50?: number;
  };
  created_at: string;
}

const REQUIRED_COLUMNS = [
  "duration_months", "team_size", "change_orders",
  "material_price_increase", "weather_impact_days", "subcontractor_count",
];

function sourceBadgeLabel(s: DatasetSource) {
  if (s.type === "baseline") return `baseline · ${s.rows}`;
  if (s.type === "real_projects") return `your projects · ${s.rows}`;
  return `${s.filename || "upload"} · ${s.rows}`;
}

export default function CostOverrunTrainingPanel({ onTrained }: { onTrained?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [validation, setValidation] = useState<DatasetValidation | null>(null);
  const [training, setTraining] = useState(false);

  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activatingVersion, setActivatingVersion] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/ml/cost-overrun/history`);
      setRuns(res.data.runs || []);
    } catch {
      // history is a nice-to-have — silently leave the list empty rather than erroring the page
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/api/v1/ml/cost-overrun/dataset/validate`, formData);
      setValidation(res.data);
      setReviewOpen(true);
      if (res.data.dataset_id) {
        toast.success(`${res.data.row_count} rows validated — review below`);
      } else {
        toast.error("This file doesn't match the required schema — see details");
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to validate file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const trainWithDataset = async () => {
    if (!validation?.dataset_id) return;
    setTraining(true);
    try {
      const res = await axios.post(`${API}/api/v1/ml/cost-overrun/train`, {
        dataset_ids: [validation.dataset_id],
      });
      toast.success(`Trained v${res.data.version} on ${res.data.total_rows.toLocaleString()} rows — model updated`);
      setReviewOpen(false);
      setValidation(null);
      fetchHistory();
      onTrained?.();
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Training failed");
    } finally {
      setTraining(false);
    }
  };

  const activateVersion = async (version: number) => {
    setActivatingVersion(version);
    try {
      await axios.post(`${API}/api/v1/ml/cost-overrun/versions/${version}/activate`);
      toast.success(`v${version} is now the active model`);
      fetchHistory();
      onTrained?.();
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to activate version");
    } finally {
      setActivatingVersion(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="font-semibold text-white text-[14px]">Training Data</h3>
              <p className="text-[11px] text-white/35">
                Upload historical projects (.csv / .xlsx) to retrain the cost-overrun model — the original baseline model is always kept and can be reactivated.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-white/80 whitespace-nowrap transition-all hover:scale-105"
              style={glassButtonStyle}>
              <History className="w-3.5 h-3.5 text-cyan-400" />
              Training History{runs.length > 0 ? ` (${runs.length})` : ""}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
              style={gradientButtonStyle}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload Training Data
            </button>
          </div>
        </div>
      </motion.div>

      {/* Upload -> validate -> review -> train */}
      <GlassModal
        open={reviewOpen}
        onClose={() => { setReviewOpen(false); setValidation(null); }}
        title={`Review dataset${validation?.filename ? ` — ${validation.filename}` : ""}`}
        subtitle="Nothing is trained until you confirm below"
        maxWidth="max-w-lg"
      >
        {validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {REQUIRED_COLUMNS.map((col) => {
                const matched = validation.matched_columns.includes(col);
                return (
                  <div key={col} className="flex items-center gap-2 text-[12px]">
                    {matched
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className={matched ? "text-white/70" : "text-red-300"}>{col}</span>
                  </div>
                );
              })}
            </div>

            {validation.errors.length > 0 && (
              <div className="p-3 rounded-xl text-[12px] text-red-300 space-y-1"
                style={{ background: ACCENT.red.bg, border: `1px solid ${ACCENT.red.border}` }}>
                {validation.errors.map((e, i) => <p key={i} className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{e}</p>)}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="p-3 rounded-xl text-[11px] text-amber-300 space-y-1"
                style={{ background: ACCENT.amber.bg, border: `1px solid ${ACCENT.amber.border}` }}>
                {validation.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            {validation.preview.length > 0 && (
              <div>
                <p className="text-[11px] text-white/35 mb-2">
                  {validation.row_count} row{validation.row_count !== 1 ? "s" : ""} parsed — preview of first {validation.preview.length}
                </p>
                <div className="max-h-[30vh] overflow-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        {Object.keys(validation.preview[0]).map((k) => (
                          <th key={k} className="text-left px-2 py-1.5 text-white/40 font-medium whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validation.preview.map((row, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="px-2 py-1.5 text-white/60 whitespace-nowrap">{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => { setReviewOpen(false); setValidation(null); }}
                className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors">
                {validation.dataset_id ? "Cancel" : "Close"}
              </button>
              {validation.dataset_id && (
                <button onClick={trainWithDataset} disabled={training}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-40"
                  style={gradientButtonStyle}>
                  {training ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Train with this dataset
                </button>
              )}
            </div>
          </div>
        )}
      </GlassModal>

      {/* Version history + rollback */}
      <GlassModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Cost-Overrun Model — Training History"
        subtitle="Every version is kept — the original baseline model can always be reactivated"
        maxWidth="max-w-2xl"
      >
        {historyLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-white/50">No training runs recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {runs.map((run) => (
              <div key={run.id} className="p-3 rounded-xl"
                style={{
                  background: run.is_active ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
                  border: run.is_active ? "1px solid rgba(0,212,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white">v{run.version}</span>
                    {run.is_baseline_only && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-white/50" style={{ background: "rgba(255,255,255,0.06)" }}>
                        original baseline
                      </span>
                    )}
                    {run.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: ACCENT.green.bg, border: `1px solid ${ACCENT.green.border}`, color: ACCENT.green.text }}>
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30">{new Date(run.created_at).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {run.dataset_sources.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full text-white/50" style={{ background: "rgba(255,255,255,0.05)" }}>
                      {sourceBadgeLabel(s)}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-white/40">
                    CV accuracy {run.metrics.cv_accuracy_mean != null ? `${(run.metrics.cv_accuracy_mean * 100).toFixed(1)}%` : "—"} ·
                    {" "}F1 {run.metrics.cv_f1_mean != null ? run.metrics.cv_f1_mean.toFixed(3) : "—"} ·
                    {" "}R² {run.metrics.regression_r2_p50 != null ? run.metrics.regression_r2_p50.toFixed(3) : "—"} ·
                    {" "}{run.total_rows.toLocaleString()} rows
                  </p>
                  {!run.is_active && (
                    <button onClick={() => activateVersion(run.version)} disabled={activatingVersion === run.version}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-40 shrink-0">
                      {activatingVersion === run.version ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassModal>
    </>
  );
}
