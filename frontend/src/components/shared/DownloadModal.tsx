"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet, FileType, FileDigit, Loader2 } from "lucide-react";
import GlassModal from "./GlassModal";
import { glassButtonStyle, gradientButtonStyle } from "@/lib/theme";
import type { ExportFormat, ExportMode } from "@/lib/export/types";

const FORMATS: { id: ExportFormat; label: string; icon: any; color: string }[] = [
  { id: "pdf", label: "PDF", icon: FileText, color: "#EF4444" },
  { id: "docx", label: "Word", icon: FileType, color: "#3B82F6" },
  { id: "csv", label: "CSV", icon: FileDigit, color: "#10B981" },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet, color: "#22D3EE" },
];

export default function DownloadModal({
  open,
  onClose,
  title,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onExport: (format: ExportFormat, mode: ExportMode) => void | Promise<void>;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [mode, setMode] = useState<ExportMode>("full");
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onExport(format, mode);
      onClose();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title={title} subtitle="Choose a format and level of detail">
      <div className="space-y-5">
        <div>
          <label className="text-xs text-white/35 mb-2 block">Format</label>
          <div className="grid grid-cols-4 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all"
                style={
                  format === f.id
                    ? { borderColor: f.color, background: `${f.color}1A`, color: f.color }
                    : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.5)" }
                }
              >
                <f.icon className="w-4 h-4" />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/35 mb-2 block">Content</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("summary")}
              className="flex flex-col items-start gap-0.5 px-3.5 py-2.5 rounded-xl border text-left transition-all"
              style={
                mode === "summary"
                  ? { borderColor: "rgba(0,212,255,0.4)", background: "rgba(0,212,255,0.08)" }
                  : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
              }
            >
              <span className="text-xs font-medium text-white">Summary</span>
              <span className="text-[10px] text-white/35">Key totals &amp; counts only</span>
            </button>
            <button
              onClick={() => setMode("full")}
              className="flex flex-col items-start gap-0.5 px-3.5 py-2.5 rounded-xl border text-left transition-all"
              style={
                mode === "full"
                  ? { borderColor: "rgba(0,212,255,0.4)", background: "rgba(0,212,255,0.08)" }
                  : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
              }
            >
              <span className="text-xs font-medium text-white">Full Detail</span>
              <span className="text-[10px] text-white/35">Every entry, row by row</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-all"
            style={glassButtonStyle}
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
            style={gradientButtonStyle}
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Download
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
