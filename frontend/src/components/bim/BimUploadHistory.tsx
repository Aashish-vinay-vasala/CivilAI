"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { History, Box, Building2, Download, Trash2, Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import {
  modelDownloadUrl, downloadBlobFromUrl, formatFileSize,
  deleteModel, deleteProjectModelHistory,
} from "@/lib/bimFallback";
import { ACCENT } from "@/lib/theme";

interface ProjectLite { id: string; name: string }

interface BimUploadHistoryProps {
  projectId: string;
  projects: ProjectLite[];
  /** Fired after any delete that could change which model is "current" for projectId,
   *  so the parent (which owns its own current-model state) can refetch it. */
  onCurrentModelChanged?: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL;

export default function BimUploadHistory({ projectId, projects, onCurrentModelChanged }: BimUploadHistoryProps) {
  const [scope, setScope] = useState<"project" | "all">("project");
  const [projectHistory, setProjectHistory] = useState<any[]>([]);
  const [allLatestModels, setAllLatestModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchProjectHistory = async (pid: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/bim/project/${pid}/models`);
      setProjectHistory(res.data.models || []);
    } catch {
      setProjectHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLatestModels = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/bim/models/latest`);
      setAllLatestModels(res.data.models || []);
    } catch {
      setAllLatestModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scope === "project") {
      if (projectId) fetchProjectHistory(projectId); else setProjectHistory([]);
    } else {
      fetchAllLatestModels();
    }
  }, [scope, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = (modelId: string, filename: string) => {
    downloadBlobFromUrl(modelDownloadUrl(modelId), filename || "model.ifc").catch(() => toast.error("Could not download IFC file."));
  };

  const handleDeleteOne = async (row: any) => {
    if (!window.confirm(`Permanently delete "${row.original_name || row.file_name}"? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      await deleteModel(row.id);
      toast.success("File deleted");
      const wasCurrent = !!row.is_current;
      if (scope === "project") await fetchProjectHistory(projectId); else await fetchAllLatestModels();
      if (wasCurrent) onCurrentModelChanged?.();
    } catch {
      toast.error("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!projectId || projectHistory.length === 0) return;
    if (!window.confirm(`Permanently delete all ${projectHistory.length} uploaded IFC file(s) for this project? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      await deleteProjectModelHistory(projectId);
      toast.success("All history deleted for this project");
      setProjectHistory([]);
      onCurrentModelChanged?.();
    } catch {
      toast.error("Failed to delete history");
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-white">IFC Upload History</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
            <button onClick={() => setScope("project")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={scope === "project" ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF" } : { color: "rgba(255,255,255,0.4)" }}>
              This Project
            </button>
            <button onClick={() => setScope("all")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={scope === "all" ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF" } : { color: "rgba(255,255,255,0.4)" }}>
              All Projects
            </button>
          </div>
          {scope === "project" && projectHistory.length > 0 && (
            <button onClick={handleDeleteAll} disabled={deletingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              style={{ border: "1px solid rgba(239,68,68,0.25)" }}>
              {deletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete All
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="w-6 h-6 text-white/30 animate-spin mx-auto" /></div>
      ) : scope === "project" ? (
        projectHistory.length > 0 ? (
          <div className="space-y-2">
            {projectHistory.map((row: any) => (
              <div key={row.id} className="flex items-center gap-4 p-3 rounded-xl transition-colors hover:bg-white/[0.03]"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: ACCENT.cyan.bg }}>
                  <Box className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{row.original_name || row.file_name}</p>
                  <p className="text-xs text-white/35">
                    Uploaded {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    {row.file_size ? ` · ${formatFileSize(row.file_size)}` : ""}
                  </p>
                </div>
                {row.is_current && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 whitespace-nowrap">Current</span>
                )}
                <button onClick={() => handleDownload(row.id, row.original_name || "model.ifc")}
                  className="p-2 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors" title="Download">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteOne(row)} disabled={deletingId === row.id}
                  className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50" title="Delete">
                  {deletingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center">
            <Box className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-xs text-white/35">No IFC files uploaded for this project yet</p>
          </div>
        )
      ) : allLatestModels.length > 0 ? (
        <div className="space-y-2">
          {allLatestModels.map((row: any) => {
            const proj = projects.find(p => p.id === row.project_id);
            return (
              <div key={row.id} className="flex items-center gap-4 p-3 rounded-xl transition-colors hover:bg-white/[0.03]"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: ACCENT.cyan.bg }}>
                  <Building2 className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{proj?.name || "Unknown project"}</p>
                  <p className="text-xs text-white/35 truncate">
                    {row.original_name || row.file_name} · {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    {row.file_size ? ` · ${formatFileSize(row.file_size)}` : ""}
                  </p>
                </div>
                <button onClick={() => handleDownload(row.id, row.original_name || "model.ifc")}
                  className="p-2 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors" title="Download">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteOne(row)} disabled={deletingId === row.id}
                  className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50" title="Delete">
                  {deletingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center">
          <Building2 className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-xs text-white/35">No IFC files uploaded for any project yet</p>
        </div>
      )}
    </motion.div>
  );
}
