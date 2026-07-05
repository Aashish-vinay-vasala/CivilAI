"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Upload, Loader2, Sparkles, Copy, Check, FileAudio, X } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

export default function TranscribePage() {
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [structuring, setStructuring] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [minutes, setMinutes] = useState("");
  const [copied, setCopied] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const recorded = new File([blob], "recording.webm", { type: "audio/webm" });
        setFile(recorded);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch { toast.error("Microphone access denied"); }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const transcribeAudio = async (audioFile: File) => {
    setTranscribing(true);
    setTranscript("");
    setMinutes("");
    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/transcribe`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const text = res.data?.transcript || res.data?.text || "";
      setTranscript(text);
      if (text) structureMinutes(text);
    } catch {
      toast.error("Transcription failed — check backend /api/v1/transcribe");
    } finally {
      setTranscribing(false);
    }
  };

  const structureMinutes = async (text: string) => {
    setStructuring(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Convert the following meeting transcript into structured meeting minutes with:
- Date & Attendees (infer from transcript if possible)
- Executive Summary
- Key Decisions
- Action Items (with owner and due date)
- Next Steps

Transcript:
${text}`,
        context: "Meeting Transcription",
      });
      setMinutes(res.data?.response || "");
      toast.success("Meeting minutes structured by AI");
    } catch { toast.error("AI structuring failed"); }
    finally { setStructuring(false); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">AI Meeting Transcription</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload audio or record live → get structured meeting minutes</p>
      </motion.div>

      {/* Input area */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Upload */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => fileRef.current?.click()}
          className="bg-card border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500/50 transition-colors"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-sm font-medium text-foreground">Upload Audio File</p>
          <p className="text-xs text-muted-foreground text-center">MP3, MP4, WAV, WEBM, M4A · max 25MB</p>
          {file && !recording && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
              <FileAudio className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-foreground truncate max-w-32">{file.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="audio/*,video/mp4" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        </motion.div>

        {/* Record */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3"
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${recording ? "bg-red-500/20" : "bg-red-500/10"}`}>
            <Mic className={`w-5 h-5 ${recording ? "text-red-400 animate-pulse" : "text-red-400"}`} />
          </div>
          <p className="text-sm font-medium text-foreground">{recording ? "Recording…" : "Record Live"}</p>
          <p className="text-xs text-muted-foreground">Use your microphone directly</p>
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              recording
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </button>
        </motion.div>
      </div>

      {/* Transcribe button */}
      {file && (
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => transcribeAudio(file)}
          disabled={transcribing || structuring}
          className="w-full py-3 rounded-2xl gradient-blue text-white font-medium flex items-center justify-center gap-2"
        >
          {transcribing ? <><Loader2 className="w-4 h-4 animate-spin" /> Transcribing with Whisper…</> : <><Sparkles className="w-4 h-4" /> Transcribe & Generate Minutes</>}
        </motion.button>
      )}

      {/* Transcript */}
      {transcript && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Raw Transcript</p>
            <button onClick={() => copy(transcript)} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{transcript}</p>
        </motion.div>
      )}

      {/* Structured Minutes */}
      {(structuring || minutes) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-cyan-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <p className="text-sm font-semibold text-foreground">AI Meeting Minutes</p>
            </div>
            {minutes && (
              <button onClick={() => copy(minutes)} className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          {structuring ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Structuring with AI…
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{minutes}</p>
          )}
        </motion.div>
      )}

      <ModuleChat context="Meeting Transcription" placeholder="Ask about the transcript, extract action items…" pageSummaryData={{ hasTranscript: !!transcript }} />
    </div>
  );
}
