"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, VolumeX, Loader2, Bot, User,
  Settings2, Trash2, ChevronDown, Sparkles,
  Upload, AudioLines, Users2, CheckCircle2, AlertCircle, Download,
  History, Database, FileText, ChevronRight, RefreshCw, Copy, Check,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWebSpeechSTT } from "@/hooks/useWebSpeechSTT";
import { supabase } from "@/lib/supabase";
import { speak as speakText, stopSpeaking as stopSpeakingPlayback, fetchGroqVoices, type VoiceChoice } from "@/lib/ttsPlayback";
import { authHeaders } from "@/lib/apiAuth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const VOICE_KEY = "civilai_voicepage_voice";

function renderContent(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

type RecordState = "idle" | "recording" | "processing" | "playing";

interface Turn {
  id:         string;
  transcript: string;
  response:   string;
  timestamp:  string;
  status:     "success" | "blocked" | "error";
}

// ── Waveform ───────────────────────────────────────────────────────────────────

function WaveBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.75 h-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full"
          style={{ background: "rgba(0,212,255,0.7)" }}
          animate={active ? { height: ["8px", `${16 + (i % 5) * 8}px`, "8px"] } : { height: "4px" }}
          transition={{ duration: 0.5 + i * 0.04, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function PulseRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      <motion.div className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: "2px solid rgba(239,68,68,0.6)" }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
        transition={{ duration: 1.4, repeat: Infinity }} />
      <motion.div className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: "2px solid rgba(239,68,68,0.3)" }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }} />
    </>
  );
}

// ── Live transcript bubble ─────────────────────────────────────────────────────

function LiveTranscript({ text, show }: { text: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="w-full max-w-sm mx-auto px-4 py-2.5 rounded-xl text-sm text-center"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            minHeight: "2.5rem",
          }}
        >
          {text ? (
            <span className="text-white/70 italic">{text}</span>
          ) : (
            <span className="text-white/25 text-xs">Listening…</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Turn card ──────────────────────────────────────────────────────────────────

function TurnCard({ turn }: { turn: Turn }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex gap-3 justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-none px-4 py-3 text-sm"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.15),rgba(29,78,216,0.15))", border: "1px solid rgba(0,212,255,0.2)" }}>
          <p className="text-white/80 leading-relaxed">{turn.transcript}</p>
          <p className="text-white/25 text-[10px] mt-1 text-right">{turn.timestamp}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.2),rgba(29,78,216,0.2))", border: "1px solid rgba(0,212,255,0.25)" }}>
          <Bot className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="max-w-[75%] rounded-2xl rounded-tl-none px-4 py-3 text-sm"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className={cn("leading-relaxed", turn.status === "blocked" ? "text-amber-400/80 italic" : "text-white/70")}>
            {renderContent(turn.response)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── File upload tool panel ────────────────────────────────────────────────────

function UploadPanel({
  title, description, icon: Icon, endpoint, buildForm, renderResult,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  endpoint: string;
  buildForm: (file: File) => FormData;
  renderResult: (data: Record<string, unknown>) => React.ReactNode;
}) {
  const [file,    setFile]    = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<Record<string, unknown> | null>(null);
  const [error,   setError]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res  = await fetch(`${API}${endpoint}`, { method: "POST", body: buildForm(file), headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <Icon className="w-4.5 h-4.5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/40">{description}</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 py-8 transition-colors"
        style={{ borderColor: file ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.015)" }}
      >
        <Upload className="w-6 h-6 text-white/30" />
        <p className="text-sm text-white/50">{file ? file.name : "Click to upload a WAV file"}</p>
        {file && <p className="text-xs text-white/25">{(file.size / 1024).toFixed(1)} KB</p>}
        <input ref={inputRef} type="file" accept=".wav,audio/*" className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <button
        onClick={run}
        disabled={!file || loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.22),rgba(29,78,216,0.22))", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
      >
        {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</span> : "Analyse"}
      </button>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/08">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {renderResult(result)}
        </motion.div>
      )}
    </div>
  );
}

// ── Diarization panel ────────────────────────────────────────────────────────

const SPEAKER_COLORS = ["#00D4FF", "#34D399", "#F59E0B", "#60A5FA", "#14B8A6", "#EF4444"];

type DiarizeSeg  = { speaker: string; start: number; end: number };
type DialogueTurn = { speaker: string; start: number; end: number; text: string };
type DiarizeData = {
  num_speakers?: number;
  segments?:     DiarizeSeg[];
  dialogue?:     DialogueTurn[];
  engine?:       string;
  error?:        string;
  transcript_error?: string;
};

function DiarizePanel() {
  const [file,        setFile]        = useState<File | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<DiarizeData | null>(null);
  const [error,       setError]       = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summary,     setSummary]     = useState("");
  const [sumError,    setSumError]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [savedId,     setSavedId]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const segs     = result?.segments ?? [];
  const speakers = [...new Set(segs.map(s => s.speaker))];
  const totalDur = segs.reduce((a, s) => Math.max(a, s.end), 0) || 1;
  const colorOf  = (sp: string) => SPEAKER_COLORS[speakers.indexOf(sp) % SPEAKER_COLORS.length];

  const analyse = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResult(null); setSummary(""); setSumError("");
    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      fd.append("include_transcript", "true");
      const res  = await fetch(`${API}/api/v1/voice/diarize`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setResult(data as DiarizeData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const buildPDF = (): jsPDF => {
    const doc = new jsPDF();
    const pw  = doc.internal.pageSize.getWidth();
    let   y   = 20;

    doc.setFontSize(20); doc.setTextColor(20, 20, 20);
    doc.text("Meeting Analysis Report", pw / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleString()}  ·  ${file?.name ?? ""}`, pw / 2, y, { align: "center" });
    y += 12;

    // Speaker overview
    doc.setFontSize(13); doc.setTextColor(20, 20, 20);
    doc.text("Speaker Overview", 14, y); y += 4;
    const speakerRows = speakers.map(sp => {
      const spSegs    = segs.filter(s => s.speaker === sp);
      const totalTime = spSegs.reduce((a, s) => a + (s.end - s.start), 0);
      return [sp, String(spSegs.length), `${totalTime.toFixed(1)}s`];
    });
    autoTable(doc, {
      startY: y, head: [["Speaker", "Segments", "Speaking Time"]], body: speakerRows,
      theme: "striped", headStyles: { fillColor: [0, 100, 180] },
      margin: { left: 14, right: 14 }, styles: { fontSize: 10 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    // Transcript
    if (result?.dialogue && result.dialogue.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13); doc.setTextColor(20, 20, 20);
      doc.text("Transcript", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Speaker", "Time", "Dialogue"]],
        body: result.dialogue.map(d => [d.speaker, `${d.start.toFixed(1)}s – ${d.end.toFixed(1)}s`, d.text]),
        theme: "striped", headStyles: { fillColor: [0, 100, 180] },
        columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 28 }, 2: { cellWidth: "auto" } },
        margin: { left: 14, right: 14 }, styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    // Summary
    if (summary) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13); doc.setTextColor(20, 20, 20);
      doc.text("Meeting Summary", 14, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text(doc.splitTextToSize(summary, pw - 28) as string[], 14, y);
    }

    return doc;
  };

  const downloadPDF = () => {
    buildPDF().save(`meeting-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const saveToDB = async () => {
    if (!result) return;
    setSaving(true); setSavedId(null);
    try {
      // Generate PDF as a Blob and POST everything to the backend.
      // The backend holds the service-role key and can create the storage bucket.
      const pdfBlob = new Blob(
        [buildPDF().output("arraybuffer")],
        { type: "application/pdf" },
      );

      const fd = new FormData();
      fd.append("pdf",          pdfBlob, `meeting-${Date.now()}.pdf`);
      if (file) fd.append("audio", file, file.name);
      fd.append("dialogue",     JSON.stringify(result.dialogue ?? []));
      fd.append("summary",      summary);
      fd.append("filename",     file?.name ?? "recording");
      fd.append("num_speakers", String(result.num_speakers ?? 0));
      fd.append("segments",     JSON.stringify(result.segments ?? []));

      const res  = await fetch(`${API}/api/v1/voice/meetings/save`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      setSavedId((data.record as { id: string }).id);
    } catch (e) {
      console.error("Save to database failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const summarize = async () => {
    if (!result?.dialogue?.length) return;
    setSummarizing(true); setSumError(""); setSummary("");
    try {
      const fd = new FormData();
      fd.append("dialogue", JSON.stringify(result.dialogue));
      const res  = await fetch(`${API}/api/v1/voice/meeting-summary`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setSummary(data.summary);
    } catch (e) {
      setSumError(e instanceof Error ? e.message : "Summary failed");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <Users2 className="w-[18px] h-[18px] text-cyan-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Speaker Diarization</h2>
          <p className="text-xs text-white/40">Detect speakers · transcribe turns · summarize meeting</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 py-8 transition-colors"
        style={{ borderColor: file ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.015)" }}
      >
        <Upload className="w-6 h-6 text-white/30" />
        <p className="text-sm text-white/50">{file ? file.name : "Click to upload a meeting recording"}</p>
        {file && <p className="text-xs text-white/25">{(file.size / 1024).toFixed(1)} KB</p>}
        <input ref={inputRef} type="file" accept="audio/*" className="hidden"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setSummary(""); }} />
      </div>

      {/* Analyse */}
      <button
        onClick={analyse}
        disabled={!file || loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.22),rgba(29,78,216,0.22))", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
      >
        {loading
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</span>
          : "Analyse Meeting"}
      </button>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {result?.error && (
        <div className="px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/5">
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Stats + legend + timeline */}
          <div className="rounded-2xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/70">
                {result.num_speakers} speaker{result.num_speakers !== 1 ? "s" : ""} · {segs.length} segments
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {speakers.map(sp => (
                <span key={sp} className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: `${colorOf(sp)}18`, border: `1px solid ${colorOf(sp)}40`, color: colorOf(sp) }}>
                  {sp}
                </span>
              ))}
            </div>
            <div className="relative h-8 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
              {segs.map((s, i) => (
                <div key={i} className="absolute top-1 bottom-1 rounded"
                  style={{
                    left:  `${(s.start / totalDur) * 100}%`,
                    width: `${Math.max((s.end - s.start) / totalDur * 100, 0.5)}%`,
                    background: colorOf(s.speaker), opacity: 0.75,
                  }}
                  title={`${s.speaker}: ${s.start.toFixed(1)}s – ${s.end.toFixed(1)}s`}
                />
              ))}
            </div>
          </div>

          {/* Transcript / dialogue */}
          {result.dialogue && result.dialogue.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider px-1">Transcript</p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {result.dialogue.map((d, i) => (
                  <div key={i} className="flex gap-3 rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="shrink-0 w-24 pt-0.5">
                      <span className="text-xs font-bold block" style={{ color: colorOf(d.speaker) }}>{d.speaker}</span>
                      <span className="text-[10px] text-white/25">{d.start.toFixed(1)}s</span>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed">{d.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.transcript_error && (
            <p className="text-xs text-amber-400/70 px-1">Transcript unavailable: {result.transcript_error}</p>
          )}

          {/* Action buttons */}
          {result.dialogue && result.dialogue.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={summarize}
                  disabled={summarizing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(29,78,216,0.18))", border: "1px solid rgba(59,130,246,0.3)", color: "#60A5FA" }}
                >
                  {summarizing ? <><Loader2 className="w-4 h-4 animate-spin" /> Summarizing…</> : <><Sparkles className="w-4 h-4" /> Summarize</>}
                </button>
                <button
                  onClick={downloadPDF}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.12))", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399" }}
                >
                  <Download className="w-4 h-4" /> Download PDF
                </button>
              </div>
              <button
                onClick={saveToDB}
                disabled={saving || !!savedId}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08))", border: "1px solid rgba(251,191,36,0.25)", color: "#FCD34D" }}
              >
                {saving   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : savedId ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved to Database</>
                :           <><Database className="w-4 h-4" /> Save to Database</>}
              </button>
              {savedId && (
                <p className="text-[10px] text-white/30 text-center">
                  Record ID: {savedId} — visible in History tab
                </p>
              )}
            </div>
          )}

          {sumError && (
            <div className="px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/5">
              {sumError}
            </div>
          )}

          {summary && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">Meeting Summary</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{renderContent(summary)}</p>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── VAD panel (WebRTC or Silero) ─────────────────────────────────────────────

type WebRTCSeg = { start_ms: number; end_ms: number; speech: boolean };
type SileroSeg = { start: number; end: number };
type VadData   = Record<string, unknown>;

function VadPanel({ engine }: { engine: "webrtc" | "silero" }) {
  const [file,    setFile]    = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<VadData | null>(null);
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isWebRTC  = engine === "webrtc";
  const title     = isWebRTC ? "Voice Activity Detection — WebRTC" : "Voice Activity Detection — Silero";
  const desc      = isWebRTC
    ? "Frame-level speech/silence detection (Google WebRTC VAD, lightweight)"
    : "ML-based VAD — more accurate on noisy or far-field audio (PyTorch)";

  const analyse = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResult(null); setSavedId(null);
    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      fd.append("engine", isWebRTC ? "webrtc" : "silero");
      const res  = await fetch(`${API}/api/v1/voice/vad`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const buildVadPDF = (): jsPDF => {
    const doc = new jsPDF();
    const pw  = doc.internal.pageSize.getWidth();
    let   y   = 20;

    doc.setFontSize(18); doc.setTextColor(20, 20, 20);
    doc.text(`Voice Activity Detection Report`, pw / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    doc.text(`Engine: ${isWebRTC ? "WebRTC VAD" : "Silero VAD"}  ·  File: ${file?.name ?? ""}  ·  ${new Date().toLocaleString()}`, pw / 2, y, { align: "center" });
    y += 12;

    if (isWebRTC) {
      const segs    = (result?.segments as WebRTCSeg[]) ?? [];
      const speech  = segs.filter(s => s.speech).length;
      const ratio   = (result?.speech_ratio as number ?? 0) * 100;
      doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      doc.text("Summary", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head:   [["Metric", "Value"]],
        body:   [
          ["Speech Ratio",  `${ratio.toFixed(1)}%`],
          ["Speech Frames", `${speech}`],
          ["Total Frames",  `${segs.length}`],
          ["Silence Frames",`${segs.length - speech}`],
        ],
        theme: "striped", headStyles: { fillColor: [0, 100, 180] },
        margin: { left: 14, right: 14 }, styles: { fontSize: 10 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      const speechSegs = segs.filter(s => s.speech);
      if (speechSegs.length > 0) {
        doc.setFontSize(12); doc.setTextColor(20, 20, 20);
        doc.text("Speech Segments", 14, y); y += 4;
        autoTable(doc, {
          startY: y,
          head:   [["#", "Start (ms)", "End (ms)", "Duration (ms)"]],
          body:   speechSegs.map((s, i) => [i + 1, s.start_ms, s.end_ms, s.end_ms - s.start_ms]),
          theme: "striped", headStyles: { fillColor: [0, 150, 100] },
          margin: { left: 14, right: 14 }, styles: { fontSize: 9 },
        });
      }
    } else {
      const segs = (result?.segments as SileroSeg[]) ?? [];
      doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      doc.text("Summary", 14, y); y += 4;
      const totalSpeech = segs.reduce((a, s) => a + (s.end - s.start), 0);
      autoTable(doc, {
        startY: y,
        head:   [["Metric", "Value"]],
        body:   [
          ["Speech Segments", `${segs.length}`],
          ["Total Speech",    `${totalSpeech.toFixed(2)}s`],
        ],
        theme: "striped", headStyles: { fillColor: [0, 100, 180] },
        margin: { left: 14, right: 14 }, styles: { fontSize: 10 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      if (segs.length > 0) {
        doc.setFontSize(12); doc.setTextColor(20, 20, 20);
        doc.text("Speech Segments", 14, y); y += 4;
        autoTable(doc, {
          startY: y,
          head:   [["#", "Start (s)", "End (s)", "Duration (s)"]],
          body:   segs.map((s, i) => [i + 1, s.start.toFixed(3), s.end.toFixed(3), (s.end - s.start).toFixed(3)]),
          theme: "striped", headStyles: { fillColor: [0, 150, 100] },
          margin: { left: 14, right: 14 }, styles: { fontSize: 9 },
        });
      }
    }
    return doc;
  };

  const downloadPDF = () => {
    buildVadPDF().save(`vad-${engine}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const saveToDB = async () => {
    if (!result) return;
    setSaving(true); setSavedId(null);
    try {
      const pdfBlob = new Blob([buildVadPDF().output("arraybuffer")], { type: "application/pdf" });

      const segsRaw  = (result.segments as (WebRTCSeg | SileroSeg)[]) ?? [];
      const speechSegs = isWebRTC
        ? segsRaw.filter((s): s is WebRTCSeg => (s as WebRTCSeg).speech)
        : segsRaw as SileroSeg[];

      const fd = new FormData();
      fd.append("pdf",          pdfBlob, `vad-${Date.now()}.pdf`);
      if (file) fd.append("audio", file, file.name);
      fd.append("filename",     file?.name ?? "recording");
      fd.append("engine",       engine);
      fd.append("speech_ratio", String((result.speech_ratio as number) ?? 0));
      fd.append("num_segments", String(speechSegs.length));
      fd.append("segments",     JSON.stringify(speechSegs));

      const res  = await fetch(`${API}/api/v1/voice/vad/save`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setSavedId((data.record as { id: string }).id);
    } catch (e) {
      console.error("VAD save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Result display
  const renderResult = () => {
    if (!result) return null;
    if (result.error) return <p className="text-red-400 text-sm">{String(result.error)}</p>;

    if (isWebRTC) {
      const segs   = (result.segments as WebRTCSeg[]) ?? [];
      const speech = segs.filter(s => s.speech).length;
      const ratio  = result.speech_ratio as number;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">Speech: <span className="text-emerald-400 font-semibold">{((ratio ?? 0) * 100).toFixed(1)}%</span></span>
            <span className="text-white/60">Frames: <span className="text-white/80">{speech}/{segs.length}</span></span>
          </div>
          <div className="flex flex-wrap gap-0.5">
            {segs.map((s, i) => (
              <div key={i} className="w-2 h-4 rounded-sm"
                style={{ background: s.speech ? "#34D399" : "rgba(255,255,255,0.08)" }}
                title={`${s.start_ms}ms: ${s.speech ? "speech" : "silence"}`} />
            ))}
          </div>
        </div>
      );
    }

    const segs = (result.segments as SileroSeg[]) ?? [];
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/60">{segs.length} speech segment{segs.length !== 1 ? "s" : ""}</p>
        {segs.map((s, i) => (
          <div key={i} className="flex gap-3 text-xs text-white/60 py-1 border-b border-white/[0.04]">
            <span className="text-emerald-400 font-semibold">Speech {i + 1}</span>
            <span className="font-mono">{s.start.toFixed(3)}s → {s.end.toFixed(3)}s</span>
            <span className="text-white/30">{(s.end - s.start).toFixed(3)}s</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <AudioLines className="w-[18px] h-[18px] text-cyan-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-white/40">{desc}</p>
        </div>
      </div>

      {/* Drop zone */}
      <div onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 py-6 transition-colors"
        style={{ borderColor: file ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.015)" }}>
        <Upload className="w-5 h-5 text-white/30" />
        <p className="text-sm text-white/50">{file ? file.name : "Click to upload audio"}</p>
        {file && <p className="text-xs text-white/25">{(file.size / 1024).toFixed(1)} KB</p>}
        <input ref={inputRef} type="file" accept="audio/*" className="hidden"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setSavedId(null); }} />
      </div>

      {/* Analyse */}
      <button onClick={analyse} disabled={!file || loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.22),rgba(29,78,216,0.22))", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}>
        {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</span> : "Analyse"}
      </button>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {renderResult()}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={downloadPDF}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{ background: "linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.12))", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399" }}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button onClick={saveToDB} disabled={saving || !!savedId}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08))", border: "1px solid rgba(251,191,36,0.25)", color: "#FCD34D" }}>
              {saving   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : savedId ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved</>
              :           <><Database className="w-4 h-4" /> Save to DB</>}
            </button>
          </div>
          {savedId && <p className="text-[10px] text-white/30 text-center">ID: {savedId} — visible in History</p>}
        </motion.div>
      )}
    </div>
  );
}

// ── Meeting Transcription panel ───────────────────────────────────────────────

function TranscribePanel() {
  const [file,        setFile]        = useState<File | null>(null);
  const [recording,   setRecording]   = useState(false);
  const [transcribing,setTranscribing]= useState(false);
  const [structuring, setStructuring] = useState(false);
  const [transcript,  setTranscript]  = useState("");
  const [minutes,     setMinutes]     = useState("");
  const [copied,      setCopied]      = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [savedId,     setSavedId]     = useState<string | null>(null);
  const [saveError,   setSaveError]   = useState("");
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const fileRef      = useRef<HTMLInputElement>(null);
  const mediaRef     = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const downloadRef  = useRef<HTMLAnchorElement>(null);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => { if (recordedUrl) URL.revokeObjectURL(recordedUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    // Revoke previous recording URL
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob    = new Blob(chunksRef.current, { type: mimeType });
        const objUrl  = URL.createObjectURL(blob);
        setFile(new File([blob], "recording.webm", { type: mimeType }));
        setRecordedUrl(objUrl);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch { /* mic denied */ }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = downloadRef.current!;
    a.href     = recordedUrl;
    a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
    a.click();
  };

  const structureMinutes = async (text: string) => {
    setStructuring(true);
    try {
      const res  = await fetch(`${API}/api/v1/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: `Convert the following meeting transcript into structured meeting minutes using bold section headings and bullet points. Use this exact format:

**Meeting Details**
- Date, attendees (infer from context), location/platform

**Executive Summary**
- 2–3 bullets summarising the overall purpose and outcome of the meeting

**Key Decisions**
- Each decision as a bullet; name the decision-maker where identifiable

**Action Items**
- Each action item as: [Owner] — [Deliverable] — [Target Date]

**Risks & Blockers**
- Each risk with severity (Critical / High / Medium / Low) and programme or cost impact

**Technical Matters**
- Summarise technical discussions using construction terminology (CPM, EVM, NCR, ITP, RFI, LOD, SOV, PCO, etc.)

**Next Steps**
- Prioritised follow-up tasks in order of urgency

Use professional construction project management language throughout. The audience is project directors, quantity surveyors, and senior engineers.

Transcript:\n${text}`,
          session_id: `transcribe_${Date.now()}`,
        }),
      });
      const data = await res.json();
      setMinutes(data.response ?? "");
    } catch {}
    finally { setStructuring(false); }
  };

  const transcribeAudio = async () => {
    if (!file) return;
    setTranscribing(true); setTranscript(""); setMinutes(""); setSavedId(null); setSaveError("");
    try {
      const fd  = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${API}/api/v1/transcribe`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      const text = data.transcript ?? data.text ?? "";
      setTranscript(text);
      if (text) structureMinutes(text);
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally { setTranscribing(false); }
  };

  const buildPDF = (): jsPDF => {
    const doc = new jsPDF();
    const pw  = doc.internal.pageSize.getWidth();
    let   y   = 20;

    doc.setFontSize(20); doc.setTextColor(20, 20, 20);
    doc.text("Meeting Transcription", pw / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(`${new Date().toLocaleString()}  ·  ${file?.name ?? "recording"}`, pw / 2, y, { align: "center" });
    y += 14;

    doc.setFontSize(13); doc.setTextColor(20, 20, 20);
    doc.text("Raw Transcript", 14, y); y += 6;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    const tLines = doc.splitTextToSize(transcript, pw - 28) as string[];
    doc.text(tLines, 14, y);
    y += tLines.length * 5 + 10;

    if (minutes) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(13); doc.setTextColor(20, 20, 20);
      doc.text("AI Meeting Minutes", 14, y); y += 6;
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text(doc.splitTextToSize(minutes, pw - 28) as string[], 14, y);
    }
    return doc;
  };

  const downloadPDF = () => buildPDF().save(`transcription-${new Date().toISOString().slice(0, 10)}.pdf`);

  const saveToDB = async () => {
    if (!transcript) return;
    setSaving(true); setSavedId(null); setSaveError("");
    try {
      const pdfBlob = new Blob([buildPDF().output("arraybuffer")], { type: "application/pdf" });
      const fd = new FormData();
      fd.append("pdf",        pdfBlob, `transcription-${Date.now()}.pdf`);
      if (file) fd.append("audio", file, file.name);
      fd.append("transcript", transcript);
      fd.append("minutes",    minutes);
      fd.append("filename",   file?.name ?? "recording");

      const res  = await fetch(`${API}/api/v1/voice/transcriptions/save`, { method: "POST", body: fd, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setSavedId((data.record as { id: string }).id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <FileText className="w-[18px] h-[18px] text-cyan-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Meeting Transcription</h2>
          <p className="text-xs text-white/40">Record or upload · Groq Whisper STT · AI minutes · Save & PDF</p>
        </div>
      </div>

      {/* Upload + Record */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 py-6 transition-colors"
          style={{ borderColor: file && !recording ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.015)" }}
        >
          <Upload className="w-5 h-5 text-white/30" />
          <p className="text-sm text-white/50">{file && !recording ? file.name : "Upload Audio"}</p>
          <p className="text-[11px] text-white/25">MP3, WAV, M4A, WEBM · max 25 MB</p>
          <input ref={fileRef} type="file" accept="audio/*,video/mp4" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) {
                if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
                setFile(f); setTranscript(""); setMinutes(""); setSavedId(null);
              }
              e.target.value = "";
            }} />
        </div>

        <div className="rounded-2xl border-2 border-dashed flex flex-col items-center gap-3 py-5 px-4"
          style={{ borderColor: recording ? "rgba(239,68,68,0.4)" : recordedUrl ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.015)" }}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${recording ? "bg-red-500/20" : "bg-red-500/10"}`}>
            <Mic className={`w-4 h-4 ${recording ? "text-red-400 animate-pulse" : "text-red-400"}`} />
          </div>
          <p className="text-sm text-white/50">
            {recording ? "Recording…" : recordedUrl ? "Recording ready" : "Record Live"}
          </p>

          {/* Playback preview — shown after recording stops */}
          {recordedUrl && !recording && (
            <audio
              controls
              src={recordedUrl}
              className="w-full h-8 rounded-lg"
              style={{ accentColor: "#00D4FF" }}
            />
          )}

          <div className="flex gap-2 w-full justify-center">
            <button
              onClick={recording ? stopRecording : startRecording}
              className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={recording
                ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }
                : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }
              }
            >
              {recording ? "Stop" : recordedUrl ? "Re-record" : "Start"}
            </button>

            {/* Download recording button */}
            {recordedUrl && !recording && (
              <button
                onClick={downloadRecording}
                className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
                style={{ background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
              >
                <Download className="w-3 h-3" /> Download
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden anchor for programmatic download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={downloadRef} className="hidden" />

      {/* Transcribe button */}
      {file && !recording && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button
            onClick={transcribeAudio}
            disabled={transcribing || structuring}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.22),rgba(29,78,216,0.22))", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
          >
            {transcribing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Transcribing with Whisper…</>
              : structuring
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Structuring minutes…</>
              : <><Sparkles className="w-4 h-4" /> Transcribe & Generate Minutes</>
            }
          </button>
        </motion.div>
      )}

      {/* Raw transcript */}
      {transcript && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Raw Transcript</p>
            <button
              onClick={() => { navigator.clipboard.writeText(transcript); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-white/30 hover:text-white/60 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">{transcript}</p>
        </motion.div>
      )}

      {/* AI Minutes */}
      {(structuring || minutes) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider">AI Meeting Minutes</p>
          </div>
          {structuring
            ? <div className="flex items-center gap-2 text-sm text-white/40"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Structuring with AI…</div>
            : <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto pr-1">{renderContent(minutes)}</p>
          }
        </motion.div>
      )}

      {/* Actions */}
      {transcript && !structuring && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          <div className="flex gap-2">
            <button onClick={downloadPDF}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{ background: "linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.12))", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399" }}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button onClick={saveToDB} disabled={saving || !!savedId}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08))", border: "1px solid rgba(251,191,36,0.25)", color: "#FCD34D" }}>
              {saving   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : savedId ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved</>
              :           <><Database className="w-4 h-4" /> Save to Database</>}
            </button>
          </div>
          {savedId    && <p className="text-[10px] text-white/30 text-center">Record ID: {savedId} — visible in History tab</p>}
          {saveError  && <p className="text-[11px] text-red-400 text-center">{saveError}</p>}
        </motion.div>
      )}
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

type VoiceSession = {
  id: string; label: string; turns: Turn[]; created_at: string;
};
type MeetingRecord = {
  id: string; filename: string; pdf_url: string; pdf_path: string; audio_url: string;
  num_speakers: number; dialogue: DialogueTurn[]; summary: string; created_at: string;
};
type VadRecord = {
  id: string; filename: string; engine: string; pdf_url: string; pdf_path: string; audio_url: string;
  speech_ratio: number; num_segments: number; segments: Record<string, unknown>[]; created_at: string;
};
type TranscriptionRecord = {
  id: string; filename: string; transcript: string; minutes: string;
  pdf_url: string; pdf_path: string; audio_url: string; created_at: string;
};
type ChatMsg = { role: "user" | "assistant"; content: string };
type ChatSessionRecord = {
  id: string; label: string; messages: ChatMsg[]; created_at: string;
};
type ChatTranscriptRecord = {
  id: string; label: string; messages: ChatMsg[];
  pdf_url: string; pdf_path: string; created_at: string;
};

function HistoryPanel() {
  const [sessions,        setSessions]        = useState<VoiceSession[]>([]);
  const [meetings,        setMeetings]        = useState<MeetingRecord[]>([]);
  const [vadRecs,         setVadRecs]         = useState<VadRecord[]>([]);
  const [transcriptions,  setTranscriptions]  = useState<TranscriptionRecord[]>([]);
  const [chatSessions,    setChatSessions]    = useState<ChatSessionRecord[]>([]);
  const [chatTranscripts, setChatTranscripts] = useState<ChatTranscriptRecord[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [sessionsRes, { data: m }, { data: v }, { data: t }, chatSessionsRes, { data: ct }] = await Promise.all([
      fetch(`${API}/api/v1/voice/sessions`).then(r => r.json()).catch(() => ({ sessions: [] })),
      supabase.from("meeting_recordings").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("vad_recordings").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("transcription_recordings").select("*").order("created_at", { ascending: false }).limit(30),
      fetch(`${API}/api/v1/copilot/sessions`).then(r => r.json()).catch(() => ({ sessions: [] })),
      supabase.from("copilot_chat_transcripts").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setSessions((sessionsRes.sessions ?? []) as VoiceSession[]);
    setMeetings((m ?? []) as MeetingRecord[]);
    setVadRecs((v ?? []) as VadRecord[]);
    setTranscriptions((t ?? []) as TranscriptionRecord[]);
    setChatSessions((chatSessionsRes.sessions ?? []) as ChatSessionRecord[]);
    setChatTranscripts((ct ?? []) as ChatTranscriptRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteSession = async (id: string) => {
    try { await fetch(`${API}/api/v1/voice/sessions/${id}`, { method: "DELETE", headers: await authHeaders() }); } catch {}
    setSessions(p => p.filter(s => s.id !== id));
  };

  const deleteMeeting = async (id: string, pdfPath: string) => {
    if (pdfPath) await supabase.storage.from("meeting-reports").remove([pdfPath]);
    await supabase.from("meeting_recordings").delete().eq("id", id);
    setMeetings(p => p.filter(m => m.id !== id));
  };

  const deleteVad = async (id: string, pdfPath: string) => {
    if (pdfPath) await supabase.storage.from("vad-reports").remove([pdfPath]);
    await supabase.from("vad_recordings").delete().eq("id", id);
    setVadRecs(p => p.filter(v => v.id !== id));
  };

  const deleteTranscription = async (id: string, pdfPath: string) => {
    if (pdfPath) await supabase.storage.from("transcription-reports").remove([pdfPath]);
    await supabase.from("transcription_recordings").delete().eq("id", id);
    setTranscriptions(p => p.filter(t => t.id !== id));
  };

  const deleteChatSession = async (id: string) => {
    try { await fetch(`${API}/api/v1/copilot/sessions/${id}`, { method: "DELETE" }); } catch {}
    setChatSessions(p => p.filter(s => s.id !== id));
  };

  const deleteChatTranscript = async (id: string, pdfPath: string) => {
    if (pdfPath) await supabase.storage.from("chat-transcripts").remove([pdfPath]);
    await supabase.from("copilot_chat_transcripts").delete().eq("id", id);
    setChatTranscripts(p => p.filter(c => c.id !== id));
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString();
  const toggle = (id: string) => setExpandedId(p => p === id ? null : id);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <History className="w-[18px] h-[18px] text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">History</h2>
            <p className="text-xs text-white/40">Past sessions · meeting recordings · downloadable PDFs</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* ── Meeting Recordings ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          Meeting Recordings ({meetings.length})
        </p>
        {meetings.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No saved meetings yet — analyse a recording and click Save to Database.</p>
        )}
        {meetings.map(m => (
          <div key={m.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 font-medium truncate">{m.filename || "Meeting Recording"}</p>
                <p className="text-[10px] text-white/30">{fmt(m.created_at)} · {m.num_speakers} speaker{m.num_speakers !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.pdf_url && (
                  <a href={m.pdf_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399" }}>
                    <Download className="w-3 h-3" /> PDF
                  </a>
                )}
                <button onClick={() => toggle(m.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === m.id && "rotate-90")} />
                  {expandedId === m.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteMeeting(m.id, m.pdf_path)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === m.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
                {m.audio_url && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Audio</p>
                    <audio controls src={m.audio_url} className="w-full h-9 rounded-lg" style={{ accentColor: "#00D4FF" }} />
                  </div>
                )}
                {m.dialogue?.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {m.dialogue.map((d, i) => (
                      <div key={i} className="flex gap-3 text-xs py-1.5 border-b border-white/[0.04]">
                        <span className="font-semibold w-24 shrink-0 text-cyan-400/80">{d.speaker}</span>
                        <span className="text-white/25 font-mono shrink-0">{d.start.toFixed(1)}s</span>
                        <span className="text-white/60">{d.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {m.summary && (
                  <div className="rounded-xl p-3 text-xs text-white/60 leading-relaxed"
                    style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                    <span className="text-blue-300 font-semibold block mb-1">Summary</span>
                    {m.summary}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Transcription Recordings ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          Transcriptions ({transcriptions.length})
        </p>
        {transcriptions.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No saved transcriptions yet — use the Transcribe tab and click Save to Database.</p>
        )}
        {transcriptions.map(t => (
          <div key={t.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 font-medium truncate">{t.filename || "Recording"}</p>
                <p className="text-[10px] text-white/30">{fmt(t.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.pdf_url && (
                  <a href={t.pdf_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399" }}>
                    <Download className="w-3 h-3" /> PDF
                  </a>
                )}
                <button onClick={() => toggle(t.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === t.id && "rotate-90")} />
                  {expandedId === t.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteTranscription(t.id, t.pdf_path)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === t.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
                {t.audio_url && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Audio</p>
                    <audio controls src={t.audio_url} className="w-full h-9 rounded-lg" style={{ accentColor: "#00D4FF" }} />
                  </div>
                )}
                {t.transcript && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Transcript</p>
                    <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">{t.transcript}</p>
                  </div>
                )}
                {t.minutes && (
                  <div className="rounded-xl p-3 text-xs text-white/60 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
                    style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                    <span className="text-blue-300 font-semibold block mb-1">AI Meeting Minutes</span>
                    {t.minutes}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── VAD Recordings ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          VAD Recordings ({vadRecs.length})
        </p>
        {vadRecs.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No VAD analyses saved yet — analyse audio and click Save to DB.</p>
        )}
        {vadRecs.map(v => (
          <div key={v.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <AudioLines className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white/80 font-medium truncate">{v.filename || "Audio file"}</p>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase"
                    style={{ background: v.engine === "webrtc" ? "rgba(0,212,255,0.12)" : "rgba(59,130,246,0.12)",
                             color: v.engine === "webrtc" ? "#00D4FF" : "#60A5FA",
                             border: `1px solid ${v.engine === "webrtc" ? "rgba(0,212,255,0.25)" : "rgba(59,130,246,0.25)"}` }}>
                    {v.engine}
                  </span>
                </div>
                <p className="text-[10px] text-white/30">
                  {fmt(v.created_at)} · {(v.speech_ratio * 100).toFixed(1)}% speech · {v.num_segments} segment{v.num_segments !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {v.pdf_url && (
                  <a href={v.pdf_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399" }}>
                    <Download className="w-3 h-3" /> PDF
                  </a>
                )}
                <button onClick={() => toggle(v.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === v.id && "rotate-90")} />
                  {expandedId === v.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteVad(v.id, v.pdf_path)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === v.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3 max-h-72 overflow-y-auto">
                {v.audio_url && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Audio</p>
                    <audio controls src={v.audio_url} className="w-full h-9 rounded-lg" style={{ accentColor: "#00D4FF" }} />
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-white/50 mb-2">
                  <span>Speech: <span className="text-emerald-400 font-semibold">{(v.speech_ratio * 100).toFixed(1)}%</span></span>
                  <span>{v.num_segments} segment{v.num_segments !== 1 ? "s" : ""}</span>
                </div>
                {(v.segments ?? []).map((s, i) => (
                  v.engine === "webrtc"
                    ? <div key={i} className="flex gap-3 text-xs text-white/60 py-1 border-b border-white/[0.04]">
                        <span className="text-emerald-400 font-semibold w-16 shrink-0">Speech {i + 1}</span>
                        <span className="font-mono">{String(s.start_ms)}ms → {String(s.end_ms)}ms</span>
                        <span className="text-white/30">{Number(s.end_ms) - Number(s.start_ms)}ms</span>
                      </div>
                    : <div key={i} className="flex gap-3 text-xs text-white/60 py-1 border-b border-white/[0.04]">
                        <span className="text-emerald-400 font-semibold w-16 shrink-0">Speech {i + 1}</span>
                        <span className="font-mono">{Number(s.start).toFixed(3)}s → {Number(s.end).toFixed(3)}s</span>
                        <span className="text-white/30">{(Number(s.end) - Number(s.start)).toFixed(3)}s</span>
                      </div>
                ))}
                {(v.segments ?? []).length === 0 && (
                  <p className="text-xs text-white/25 text-center py-2">No segment data stored.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Voice Chat Sessions ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          Voice Chat Sessions ({sessions.length})
        </p>
        {sessions.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No voice sessions yet — start a conversation in Voice Chat.</p>
        )}
        {sessions.map(s => (
          <div key={s.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <Mic className="w-4 h-4 text-cyan-400/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70 truncate">{s.label || "Voice session"}</p>
                <p className="text-[10px] text-white/30">{fmt(s.created_at)} · {s.turns?.length ?? 0} turn{s.turns?.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(s.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === s.id && "rotate-90")} />
                  {expandedId === s.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteSession(s.id)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === s.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3 max-h-72 overflow-y-auto">
                {(s.turns ?? []).map((t, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] text-xs px-3 py-2 rounded-xl rounded-tr-none text-white/70"
                        style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.12)" }}>
                        {t.transcript}
                      </div>
                    </div>
                    <div className="flex">
                      <div className="max-w-[80%] text-xs px-3 py-2 rounded-xl rounded-tl-none text-white/50"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {renderContent(t.response)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Copilot Chat Sessions (floating widget, auto-saved) ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          Copilot Chat Sessions ({chatSessions.length})
        </p>
        {chatSessions.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No chat sessions yet — talk to the CivilAI assistant widget on any page.</p>
        )}
        {chatSessions.map(s => (
          <div key={s.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <Bot className="w-4 h-4 text-cyan-400/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70 truncate">{s.label || "Chat session"}</p>
                <p className="text-[10px] text-white/30">{fmt(s.created_at)} · {s.messages?.length ?? 0} message{s.messages?.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(s.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === s.id && "rotate-90")} />
                  {expandedId === s.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteChatSession(s.id)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === s.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3 max-h-72 overflow-y-auto">
                {(s.messages ?? []).map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "")}>
                    <div className={cn("max-w-[80%] text-xs px-3 py-2 rounded-xl text-white/70",
                      m.role === "user" ? "rounded-tr-none" : "rounded-tl-none text-white/50")}
                      style={m.role === "user"
                        ? { background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.12)" }
                        : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {renderContent(m.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Chat Transcripts (PDF exports from the widget) ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
          Chat Transcripts ({chatTranscripts.length})
        </p>
        {chatTranscripts.length === 0 && (
          <p className="text-sm text-white/25 py-4 text-center">No saved chat PDFs yet — use "Download PDF" in the assistant widget.</p>
        )}
        {chatTranscripts.map(c => (
          <div key={c.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 font-medium truncate">{c.label || "Chat transcript"}</p>
                <p className="text-[10px] text-white/30">{fmt(c.created_at)} · {c.messages?.length ?? 0} message{c.messages?.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.pdf_url && (
                  <a href={c.pdf_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399" }}>
                    <Download className="w-3 h-3" /> PDF
                  </a>
                )}
                <button onClick={() => toggle(c.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedId === c.id && "rotate-90")} />
                  {expandedId === c.id ? "Hide" : "View"}
                </button>
                <button onClick={() => deleteChatTranscript(c.id, c.pdf_path)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expandedId === c.id && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3 max-h-72 overflow-y-auto">
                {(c.messages ?? []).map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "")}>
                    <div className={cn("max-w-[80%] text-xs px-3 py-2 rounded-xl text-white/70",
                      m.role === "user" ? "rounded-tr-none" : "rounded-tl-none text-white/50")}
                      style={m.role === "user"
                        ? { background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.12)" }
                        : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {renderContent(m.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = "chat" | "transcribe" | "diarize" | "vad" | "history";

export default function VoicePage() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [recState,      setRecState]      = useState<RecordState>("idle");
  const [turns,         setTurns]         = useState<Turn[]>([]);
  const [error,         setError]         = useState("");
  const [groqVoices,    setGroqVoices]    = useState<string[]>([]);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceChoice,   setVoiceChoice]   = useState<VoiceChoice>({ engine: "groq", name: "autumn" });
  const [showPicker,    setShowPicker]    = useState(false);
  const [liveText,      setLiveText]      = useState("");

  const recStateRef       = useRef<RecordState>("idle");
  const recorderRef       = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const scrollRef         = useRef<HTMLDivElement>(null);
  const sessionIdRef      = useRef<string>(crypto.randomUUID());
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const voiceChoiceRef    = useRef<VoiceChoice>({ engine: "groq", name: "autumn" });
  const hasExplicitVoiceRef = useRef(false);

  const setRec = (s: RecordState) => { recStateRef.current = s; setRecState(s); };

  // Live STT (Web Speech API) — shows interim words while MediaRecorder captures
  const stt = useWebSpeechSTT({
    onInterim: (t) => setLiveText(t),
    onFinal:   (t) => setLiveText(t),
  });

  // TTS voice (persisted) — browser (Google/Microsoft) voices + Groq AI voices,
  // same dual-engine picker as the ModuleChat widget and the Copilot page.
  useEffect(() => {
    (async () => {
      const list = await fetchGroqVoices();
      if (list.length) setGroqVoices(list);
    })();

    try {
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as VoiceChoice;
        setVoiceChoice(parsed);
        voiceChoiceRef.current = parsed;
        hasExplicitVoiceRef.current = true;
      }
    } catch {}

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadBrowserVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      setBrowserVoices(list);
      if (!hasExplicitVoiceRef.current) {
        const preferred = list.find(v => /^en/i.test(v.lang)) ?? list[0];
        const choice: VoiceChoice = { engine: "browser", voiceURI: preferred.voiceURI, name: preferred.name };
        setVoiceChoice(choice);
        voiceChoiceRef.current = choice;
      }
    };
    loadBrowserVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadBrowserVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadBrowserVoices);
  }, []);

  const selectVoice = (choice: VoiceChoice) => {
    setVoiceChoice(choice);
    voiceChoiceRef.current = choice;
    hasExplicitVoiceRef.current = true;
    setShowPicker(false);
    try { localStorage.setItem(VOICE_KEY, JSON.stringify(choice)); } catch {}
  };

  const voiceLabel = voiceChoice.engine === "browser" ? voiceChoice.name.replace(/\s*\(.*\)\s*$/, "") : voiceChoice.name;

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  // Auto-save voice session via the backend after each turn (debounced 1s)
  useEffect(() => {
    if (turns.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        await fetch(`${API}/api/v1/voice/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            id:    sessionIdRef.current,
            label: turns[0].transcript.slice(0, 80),
            turns,
          }),
        });
      } catch { /* silent — auto-save best-effort */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [turns]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const buildHistory = () =>
    turns.flatMap((t) => [
      { role: "user",      content: t.transcript },
      { role: "assistant", content: t.response },
    ]);

  const sendAudio = useCallback(async (blob: Blob) => {
    setRec("processing");
    setLiveText("");
    setError("");
    try {
      const form = new FormData();
      form.append("audio",        blob, "recording.webm");
      form.append("chat_history", JSON.stringify(buildHistory()));

      const res  = await fetch(`${API}/api/v1/voice/voice-chat`, { method: "POST", body: form, headers: await authHeaders() });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      const { transcript, response, status } = data as {
        transcript: string; response: string; status?: string;
      };

      setRec("playing");
      speakText({ text: response, voiceChoice: voiceChoiceRef.current, speechRate: 1, audioRef, onEnd: () => setRec("idle") });

      setTurns((prev) => [...prev, {
        id: crypto.randomUUID(), transcript, response,
        timestamp: new Date().toLocaleTimeString(),
        status: (status as Turn["status"]) ?? "success",
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice chat failed");
      setRec("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  const startRecording = useCallback(async () => {
    if (recStateRef.current !== "idle") return;
    audioRef.current?.pause();
    setError("");
    setLiveText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current  = stream;
      chunksRef.current  = [];
      const mimeType     = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder     = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { stopStream(); sendAudio(new Blob(chunksRef.current, { type: mimeType })); };
      recorder.start(250);

      // Start live STT in parallel for interim display
      if (stt.isSupported) stt.start();

      setRec("recording");
    } catch {
      setError("Microphone access denied — please allow microphone in your browser settings.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendAudio, stt]);

  const stopRecording = () => {
    stt.stop();
    setLiveText("");
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    stopStream();
  };

  const handleMicClick = () => {
    const s = recStateRef.current;
    if (s === "idle")      return startRecording();
    if (s === "recording") return stopRecording();
    if (s === "playing")   { stopSpeakingPlayback(audioRef, () => setRec("idle")); }
  };

  const statusLabel: Record<RecordState, string> = {
    idle:       turns.length ? "Tap to ask another question" : "Tap the microphone to start",
    recording:  "Listening… tap again to stop",
    processing: "Processing your voice…",
    playing:    "Speaking — tap to stop",
  };

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold text-white">Voice Assistant</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Groq Whisper STT · Web Speech live preview · Groq PlayAI TTS
          </p>
        </div>
        <div className="flex items-center gap-2">
          {turns.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => {
              setTurns([]);
              sessionIdRef.current = crypto.randomUUID();
            }} title="Clear">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {/* Voice picker — browser (Google/Microsoft) voices + Groq AI voices */}
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowPicker((v) => !v)} className="gap-2 text-xs max-w-[160px] truncate">
              <Settings2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate capitalize">{voiceLabel}</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </Button>
            <AnimatePresence>
              {showPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
                  style={{ background: "rgba(4,11,25,0.98)", border: "1px solid rgba(0,212,255,0.15)", minWidth: "300px" }}
                >
                  <div className="py-3 px-2 max-h-96 overflow-y-auto flex flex-col gap-1.5">
                    {browserVoices.length > 0 && (
                      <>
                        <p className="px-2.5 pt-1.5 pb-2 text-[9.5px] font-semibold text-white/30 uppercase tracking-wider">
                          Browser (Google / Microsoft)
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {browserVoices.map((v) => (
                            <button key={v.voiceURI}
                              onClick={() => selectVoice({ engine: "browser", voiceURI: v.voiceURI, name: v.name })}
                              title={v.name}
                              className={cn("block w-full text-left rounded-lg px-3 py-2.5 text-[12px] leading-tight truncate transition-colors",
                                voiceChoice.engine === "browser" && voiceChoice.voiceURI === v.voiceURI
                                  ? "text-cyan-400 bg-cyan-500/15" : "text-white/65 hover:text-white hover:bg-white/8"
                              )}>
                              {v.name}
                            </button>
                          ))}
                        </div>
                        <div className="my-2.5 border-t border-white/10" />
                      </>
                    )}
                    <p className="px-2.5 pt-1.5 pb-2 text-[9.5px] font-semibold text-white/30 uppercase tracking-wider">
                      AI Voices
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {groqVoices.map((v) => (
                        <button key={v} onClick={() => selectVoice({ engine: "groq", name: v })}
                          className={cn("block w-full text-left rounded-lg px-3 py-2.5 text-[12px] leading-tight capitalize transition-colors",
                            voiceChoice.engine === "groq" && voiceChoice.name === v
                              ? "text-cyan-400 bg-cyan-500/15" : "text-white/65 hover:text-white hover:bg-white/8"
                          )}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {([
          { id: "chat",       label: "Voice Chat",  icon: Mic },
          { id: "transcribe", label: "Transcribe",  icon: FileText },
          { id: "diarize",    label: "Diarization", icon: Users2 },
          { id: "vad",        label: "VAD",         icon: AudioLines },
          { id: "history",    label: "History",     icon: History },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
            style={activeTab === id
              ? { background: "linear-gradient(135deg,rgba(0,212,255,0.2),rgba(29,78,216,0.2))", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }
              : { color: "rgba(255,255,255,0.35)" }
            }>
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Analysis panels ── */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto">
          <HistoryPanel />
        </div>
      )}

      {activeTab === "transcribe" && (
        <div className="flex-1 overflow-y-auto">
          <TranscribePanel />
        </div>
      )}

      {activeTab === "diarize" && (
        <div className="flex-1 overflow-y-auto">
          <DiarizePanel />
        </div>
      )}

      {activeTab === "vad" && (
        <div className="flex-1 overflow-y-auto space-y-6 p-1">
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <VadPanel engine="webrtc" />
          </div>
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <VadPanel engine="silero" />
          </div>
        </div>
      )}

      {/* ── Voice chat (default tab) ── */}
      {activeTab === "chat" && (<>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1 mb-6">
        {turns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-2">
            <Sparkles className="w-8 h-8 text-cyan-500/40" />
            <p className="text-sm">Ask anything about your construction project</p>
            <p className="text-xs opacity-50">Scheduling · Costs · Safety · Contracts · Workforce</p>
          </div>
        ) : turns.map((t) => <TurnCard key={t.id} turn={t} />)}
        <div ref={scrollRef} />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 border border-red-500/20 bg-red-500/10">
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic control */}
      <div className="flex flex-col items-center gap-3 pb-4">
        <WaveBars active={recState === "recording"} />

        {/* Live transcript */}
        <LiveTranscript text={liveText} show={recState === "recording"} />

        {recState !== "recording" && (
          <p className={cn("text-xs tracking-wide transition-colors",
            recState === "playing"    ? "text-cyan-400"  :
            recState === "processing" ? "text-amber-400" : "text-muted-foreground"
          )}>
            {statusLabel[recState]}
          </p>
        )}

        <div className="relative">
          <PulseRing active={recState === "recording"} />
          <motion.button
            whileHover={recState === "idle" ? { scale: 1.06 } : {}}
            whileTap={{ scale: 0.94 }}
            onClick={handleMicClick}
            disabled={recState === "processing"}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none",
              recState === "recording"  ? "bg-red-500/20 border-2 border-red-500/60"      :
              recState === "playing"    ? "bg-cyan-500/20 border-2 border-cyan-500/50"    :
              recState === "processing" ? "bg-amber-500/10 border-2 border-amber-500/30 cursor-wait" :
              "border-2 border-white/15 hover:border-cyan-400/40"
            )}
            style={recState === "idle" ? {
              background: "linear-gradient(135deg,rgba(0,212,255,0.12),rgba(29,78,216,0.12))",
              boxShadow:  "0 0 32px rgba(0,212,255,0.15),inset 0 0 20px rgba(0,212,255,0.04)",
            } : undefined}
          >
            {recState === "idle"       && <Mic     className="w-8 h-8 text-cyan-400" />}
            {recState === "recording"  && <MicOff  className="w-8 h-8 text-red-400" />}
            {recState === "processing" && <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />}
            {recState === "playing"    && <VolumeX className="w-8 h-8 text-cyan-400" />}
          </motion.button>
        </div>

        <p className="text-[10px] text-white/20 capitalize">
          Voice: {voiceLabel}
          {!stt.isSupported && " · Live preview unavailable in this browser"}
        </p>
      </div>

      </>)}
    </div>
  );
}
