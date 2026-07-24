"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Upload,
  Loader2,
  Search,
  File,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  Bot,
  Send,
  X,
  MessageSquare,
  FileImage,
  FileType,
  Sparkles,
  ChevronRight,
  Download,
  Eye,
  Database,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import DownloadModal from "@/components/shared/DownloadModal";
import { MarkdownText } from "@/lib/renderMarkdown";
import { ACCENT, AccentKey, glassInputClass, glassInputStyle, gradientButtonStyle } from "@/lib/theme";
import { downloadEntries, ExportColumn, ExportFormat, ExportMode } from "@/lib/export/downloadEntries";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const docTypeData = [
  { name: "Contracts", value: 28, color: "#3B82F6" },
  { name: "Safety", value: 22, color: "#EF4444" },
  { name: "Permits", value: 15, color: "#10B981" },
  { name: "Reports", value: 20, color: "#F59E0B" },
  { name: "Drawings", value: 15, color: "#8B5CF6" },
];

const fallbackDocs = [
  { name: "Contract_BlockA.pdf", type: "pdf", status: "processed", size: "2.4 MB", date: "2h ago", category: "Contract" },
  { name: "Safety_Audit_June.xlsx", type: "excel", status: "processed", size: "1.1 MB", date: "4h ago", category: "Safety" },
  { name: "Site_Drawing_Rev3.pdf", type: "pdf", status: "pending", size: "5.2 MB", date: "6h ago", category: "Drawing" },
  { name: "Permit_Phase2.pdf", type: "pdf", status: "processed", size: "0.8 MB", date: "1d ago", category: "Permit" },
  { name: "Material_Invoice.xlsx", type: "excel", status: "processing", size: "0.5 MB", date: "1d ago", category: "Invoice" },
  { name: "BOQ_Structural.pdf", type: "pdf", status: "processed", size: "3.2 MB", date: "2d ago", category: "BOQ" },
];

const quickQuestions = [
  "Summarize this document",
  "What are the key risks?",
  "List all obligations",
  "What are the payment terms?",
  "Identify critical dates",
  "List all parties involved",
  "What are the penalties?",
  "Highlight unusual clauses",
];

const categories = ["All", "Contract", "Safety", "Drawing", "Permit", "Invoice", "BOQ", "General"];

const DOC_TYPE_LABEL: Record<string, string> = {
  contract:  "Contract",
  safety:    "Safety",
  drawing:   "Drawing",
  blueprint: "Drawing",  // blueprints appear under Drawing tab
  permit:    "Permit",
  invoice:   "Invoice",
  boq:       "BOQ",
  general:   "General",
};

interface DocMessage {
  role: "user" | "assistant";
  content: string;
}

interface RagMessage { role: "user" | "assistant"; content: string; sources?: { name: string; type: string }[] }

// ─── Shared glass button styles (mirrors Cost & Safety pages) ─

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const cyanGradient = { background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)" };

export default function DocumentsPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [loading, setLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  const [docChatOpen, setDocChatOpen] = useState(false);
  const [docMessages, setDocMessages] = useState<DocMessage[]>([]);
  const [docInput, setDocInput] = useState("");
  const [docChatLoading, setDocChatLoading] = useState(false);
  const [currentDoc, setCurrentDoc] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [realDocs, setRealDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const ragBottomRef = useRef<HTMLDivElement>(null);
  const [ragMessages, setRagMessages] = useState<RagMessage[]>([]);
  const [ragInput, setRagInput] = useState("");
  const [ragLoading, setRagLoading] = useState(false);

  // Storage browser
  const [storageOpen, setStorageOpen] = useState(false);
  const [storageBucket, setStorageBucket] = useState<"documents" | "blueprints">("documents");
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // Download
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/list`);
      if (response.data.documents?.length > 0) {
        setRealDocs(response.data.documents);
      }
    } catch (err) {
      console.error("Failed to fetch docs", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setExtractedText("");
    setAnalysis("");
    setDocMessages([]);
    setCurrentDoc(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (prompt) formData.append("prompt", prompt);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/upload`,
        formData
      );
      setExtractedText(response.data.extracted_text || "");
      if (response.data.analysis) setAnalysis(response.data.analysis);
      setDocChatOpen(true);
      setDocMessages([{
        role: "assistant",
        content: `✅ I've processed "${file.name}" and saved it to the database! I can see the full content and answer any questions about it. What would you like to know?`,
      }]);
      toast.success("Document processed & saved!");
      triggerRefresh("documents");
      fetchDocs();
    } catch {
      toast.error("Failed to process document");
    } finally {
      setLoading(false);
    }
  };

  const sendDocMessage = async (text?: string) => {
    const msg = text || docInput.trim();
    if (!msg || docChatLoading) return;
    setDocInput("");
    const newMessages = [...docMessages, { role: "user" as const, content: msg }];
    setDocMessages(newMessages);
    setDocChatLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`,
        {
          message: `You are analyzing a construction document. Document content: "${extractedText.slice(0, 3000)}"\n\nUser question: ${msg}\n\nAnswer specifically based on the document content.`,
          chat_history: [],
        }
      );
      setDocMessages([...newMessages, {
        role: "assistant",
        content: response.data.response,
      }]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setDocMessages([...newMessages, {
        role: "assistant",
        content: "Error processing your question. Please try again.",
      }]);
    } finally {
      setDocChatLoading(false);
    }
  };

  const sendRagMessage = async (text?: string) => {
    const msg = text || ragInput.trim();
    if (!msg || ragLoading) return;
    setRagInput("");
    const next: RagMessage[] = [...ragMessages, { role: "user", content: msg }];
    setRagMessages(next);
    setRagLoading(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/ask`, { question: msg });
      setRagMessages([...next, { role: "assistant", content: res.data.answer, sources: res.data.sources }]);
      setTimeout(() => ragBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setRagMessages([...next, { role: "assistant", content: "Error querying documents. Please try again." }]);
    } finally { setRagLoading(false); }
  };

  const fetchStorage = async (bucket: "documents" | "blueprints") => {
    setStorageLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/storage/${bucket}`);
      setStorageFiles(res.data.files || []);
    } catch {
      toast.error("Failed to load storage bucket");
      setStorageFiles([]);
    } finally {
      setStorageLoading(false);
    }
  };

  const toggleStorage = () => {
    const next = !storageOpen;
    setStorageOpen(next);
    if (next) fetchStorage(storageBucket);
  };

  const downloadStorageFile = (bucket: string, filename: string) => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/storage/${bucket}/${filename}/download`, "_blank");
  };

  const deleteStorageFile = async (bucket: string, filename: string) => {
    setDeletingFile(filename);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/storage/${bucket}/${filename}`);
      setStorageFiles(prev => prev.filter((f: any) => f.name !== filename));
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    } finally {
      setDeletingFile(null);
    }
  };

  const switchBucket = (bucket: "documents" | "blueprints") => {
    setStorageBucket(bucket);
    fetchStorage(bucket);
  };

  const fmtBytes = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const getCategoryAction = (category: string): { href: string; label: string } | null => {
    switch (category) {
      case "Invoice":
      case "BOQ":    return { href: "/accounting", label: "Extract Financials" };
      case "Safety": return { href: "/safety",     label: "Safety Check" };
      case "Permit": return { href: "/compliance", label: "Check Compliance" };
      default:       return null;
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "excel": return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case "image": return <FileImage className="w-4 h-4 text-cyan-400" />;
      default: return <FileType className="w-4 h-4 text-red-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed": return <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" />Processed</span>;
      case "pending": return <span className="flex items-center gap-1 text-xs text-amber-400"><Clock className="w-3 h-3" />Pending</span>;
      default: return <span className="flex items-center gap-1 text-xs text-cyan-400"><Loader2 className="w-3 h-3 animate-spin" />Processing</span>;
    }
  };

  const publicUrl = (bucket: string, filename: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;

  const allDocs = realDocs.length > 0
    ? realDocs.map((doc: any) => ({
        name: doc.original_name || doc.filename,
        type: doc.filename?.endsWith(".xlsx") || doc.original_name?.endsWith(".xlsx") ? "excel" : "pdf",
        status: doc.status || "processed",
        size: "—",
        date: new Date(doc.created_at).toLocaleDateString(),
        category: DOC_TYPE_LABEL[doc.doc_type?.toLowerCase()] ?? "General",
        fileUrl: doc.filename && doc.bucket ? publicUrl(doc.bucket, doc.filename) : null,
      }))
    : fallbackDocs.map((d) => ({ ...d, fileUrl: null as string | null }));

  const filtered = allDocs.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || d.category === activeCategory;
    return matchSearch && matchCat;
  });

  const kpis: { label: string; value: string; accent: AccentKey; icon: any }[] = [
    { label: "Total Documents", value: realDocs.length > 0 ? realDocs.length.toString() : "248", accent: "blue", icon: FileText },
    { label: "Processed", value: realDocs.length > 0 ? realDocs.filter(d => d.status === "processed").length.toString() : "231", accent: "green", icon: CheckCircle },
    { label: "Pending", value: realDocs.length > 0 ? realDocs.filter(d => d.status === "pending").length.toString() : "12", accent: "amber", icon: Clock },
    { label: "In Database", value: realDocs.length > 0 ? `${realDocs.length} Live` : "0", accent: "cyan", icon: Database },
  ];

  const docColumns: ExportColumn[] = [
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date" },
  ];

  const handleDocsExport = async (format: ExportFormat, mode: ExportMode) => {
    await downloadEntries({
      format,
      mode,
      title: "Document Library Report",
      subtitle: `${filtered.length} document${filtered.length === 1 ? "" : "s"}`,
      kpis: kpis.map((k) => ({ label: k.label, value: k.value })),
      columns: docColumns,
      rows: filtered,
      filenameBase: `CivilAI_Document_Library_${new Date().toISOString().split("T")[0]}`,
    });
    toast.success("Document library downloaded");
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />
      <DownloadModal open={showDownload} onClose={() => setShowDownload(false)} title="Download Document Library" onExport={handleDocsExport} />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold text-white tracking-tight">Document Intelligence</h1>
        <p className="text-white/35 text-[13px] mt-1">
          Upload any construction document — contracts, blueprints, BOQ, reports — and chat with AI
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const a = ACCENT[kpi.accent];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}
            >
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <div className="relative flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                  <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                </div>
              </div>
              <p className="relative text-[28px] font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
              <p className="relative text-[13px] text-white/40 mt-1">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div
            className="border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer"
            style={dragOver
              ? { borderColor: "rgba(0,212,255,0.5)", background: "rgba(0,212,255,0.08)" }
              : { borderColor: "rgba(255,255,255,0.1)" }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <motion.div animate={{ y: dragOver ? -5 : 0 }} transition={{ duration: 0.2 }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}`, boxShadow: `0 0 20px ${ACCENT.cyan.shadow}` }}>
                {loading
                  ? <Loader2 className="w-8 h-8 animate-spin" style={{ color: ACCENT.cyan.text }} />
                  : <Upload className="w-8 h-8" style={{ color: ACCENT.cyan.text }} />}
              </div>
              <p className="text-white font-semibold text-lg mb-1">
                {loading ? "Processing & saving to database..." : "Drop your document here"}
              </p>
              <p className="text-sm text-white/35 mb-2">
                Contracts · Blueprints · BOQ · Reports · Permits · Invoices
              </p>
              <p className="text-xs text-white/25 mb-4">
                PDF · Excel · Word · PNG · JPG — Saved to Supabase Storage
              </p>
            </motion.div>
            <div className="flex gap-2 justify-center flex-wrap">
              <input
                type="text"
                placeholder="Optional: What to analyze?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className={glassInputClass + " w-64"}
                style={glassInputStyle}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className={primaryBtn}
                style={gradientButtonStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById("file-upload")?.click();
                }}
              >
                <Upload className="w-4 h-4" />
                Browse Files
              </button>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.docx,.png,.jpg,.jpeg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          </div>

          {/* Supported Types */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-medium text-white">Supported Document Types</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: "Contracts", desc: "Risk analysis, clause review", accent: "blue" },
                { label: "Blueprints", desc: "Drawing analysis, AI vision", accent: "cyan" },
                { label: "BOQ", desc: "Cost extraction, price analysis", accent: "green" },
                { label: "Safety Reports", desc: "Risk identification", accent: "red" },
                { label: "Permits", desc: "Expiry tracking, compliance", accent: "orange" },
                { label: "Invoices", desc: "Data extraction, payment terms", accent: "amber" },
              ] as { label: string; desc: string; accent: AccentKey }[]).map((type, i) => {
                const a = ACCENT[type.accent];
                return (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: a.bg }}>
                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: a.text }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: a.text }}>{type.label}</p>
                      <p className="text-xs text-white/35">{type.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </motion.div>

        {/* Document Chat */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card overflow-hidden flex flex-col"
          style={{ minHeight: "500px" }}
        >
          {!docChatOpen ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                <MessageSquare className="w-8 h-8 text-white/30" />
              </div>
              <p className="font-semibold text-white mb-2">Ask Your Documents</p>
              <p className="text-sm text-white/35 mb-4">
                Upload a document to start chatting with AI about its content
              </p>
              <div className="space-y-2 w-full max-w-xs">
                {["What are the payment terms?", "Identify all risks", "Summarize key points"].map((q) => (
                  <div key={q} className="flex items-center gap-2 p-2.5 rounded-xl text-xs text-white/40" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    {q}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: ACCENT.cyan.bg }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={cyanGradient}>
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">Document AI Chat</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <p className="text-xs text-white/35 truncate max-w-40">{currentDoc}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setDocChatOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Questions */}
              <div className="p-3 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex gap-2 flex-nowrap">
                  {quickQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendDocMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full text-white/40 hover:text-cyan-400 border transition-colors whitespace-nowrap"
                      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AnimatePresence>
                  {docMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={msg.role === "assistant" ? cyanGradient : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {msg.role === "assistant"
                          ? <Bot className="w-3.5 h-3.5 text-white" />
                          : <span className="text-xs text-white">U</span>
                        }
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed ${
                        msg.role === "assistant" ? "text-white rounded-tl-none" : "text-white rounded-tr-none"
                      }`}
                        style={msg.role === "assistant"
                          ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                          : cyanGradient}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {docChatLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={cyanGradient}>
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="rounded-2xl rounded-tl-none px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex gap-2">
                  <input
                    value={docInput}
                    onChange={(e) => setDocInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendDocMessage()}
                    placeholder="Ask anything about this document..."
                    className={glassInputClass}
                    style={glassInputStyle}
                  />
                  <button
                    onClick={() => sendDocMessage()}
                    disabled={!docInput.trim() || docChatLoading}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                    style={gradientButtonStyle}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Natural Language Search — RAG across all docs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: ACCENT.cyan.bg }}>
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <p className="text-sm font-semibold text-white">Search All Documents</p>
          <span className="text-xs text-white/35 ml-auto">Ask questions across your entire document library</span>
        </div>
        <div className="flex flex-col" style={{ minHeight: ragMessages.length ? 320 : 64 }}>
          {ragMessages.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
              {ragMessages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={msg.role === "assistant" ? { background: "rgba(0,212,255,0.15)" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {msg.role === "assistant" ? <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> : <span className="text-xs text-white">U</span>}
                  </div>
                  <div className="max-w-[80%] space-y-1">
                    <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed text-white ${msg.role === "assistant" ? "rounded-tl-none" : "rounded-tr-none"}`}
                      style={msg.role === "assistant" ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" } : cyanGradient}>
                      {msg.content}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s, j) => (
                          <span key={j} className="text-xs px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-md">{s.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {ragLoading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(0,212,255,0.15)" }}>
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => <div key={d} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={ragBottomRef} />
            </div>
          )}
          <div className="p-3 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <input value={ragInput} onChange={(e) => setRagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendRagMessage()}
              placeholder="e.g. What are the payment terms across all contracts?"
              className={glassInputClass} style={glassInputStyle} />
            <button onClick={() => sendRagMessage()} disabled={!ragInput.trim() || ragLoading}
              className="px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-all hover:scale-105 disabled:hover:scale-100"
              style={gradientButtonStyle}>
              {ragLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>

      {/* AI Analysis */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Document Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      {/* Document Library */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Document Library</h3>
            {realDocs.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {realDocs.length} from Supabase DB
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleStorage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
              style={storageOpen
                ? { background: "rgba(0,212,255,0.1)", color: "#00D4FF", borderColor: "rgba(0,212,255,0.2)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }}>
              <FolderOpen className="w-3.5 h-3.5" /> Browse Storage
            </button>
            <button onClick={() => setShowDownload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }}>
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
              <input
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs text-white placeholder:text-white/30 outline-none border focus:border-cyan-500/50 w-48"
                style={glassInputStyle}
              />
            </div>
          </div>
        </div>

        {/* Raw storage bucket browser */}
        {storageOpen && (
          <div className="mb-4 glass-card p-4" style={{ borderColor: ACCENT.cyan.border, background: ACCENT.cyan.bg }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "rgba(255,255,255,0.04)" }}>
                {(["documents", "blueprints"] as const).map((b) => (
                  <button key={b} onClick={() => switchBucket(b)}
                    className="px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                    style={storageBucket === b
                      ? { background: "rgba(0,212,255,0.2)", color: "#00D4FF" }
                      : { color: "rgba(255,255,255,0.4)" }}>
                    {b}
                  </button>
                ))}
              </div>
              <span className="text-xs text-white/35">{storageFiles.length} file(s) in bucket</span>
            </div>
            {storageLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              </div>
            ) : storageFiles.length === 0 ? (
              <p className="text-xs text-white/35 text-center py-4">No files in this bucket</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {storageFiles.map((f: any, i: number) => (
                  <div key={f.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <FileText className="w-3.5 h-3.5 text-cyan-400/70 shrink-0" />
                    <span className="text-xs text-white flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-white/35">{fmtBytes(f.metadata?.size)}</span>
                    <span className="text-[10px] text-white/35 whitespace-nowrap">
                      {f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "—"}
                    </span>
                    <a href={publicUrl(storageBucket, f.name)} target="_blank" rel="noreferrer"
                      className="text-cyan-400/70 hover:text-cyan-400">
                      <Eye className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => downloadStorageFile(storageBucket, f.name)}
                      className="text-cyan-400/70 hover:text-cyan-400">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteStorageFile(storageBucket, f.name)}
                      disabled={deletingFile === f.name}
                      className="text-red-400/70 hover:text-red-400">
                      {deletingFile === f.name
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={activeCategory === cat
                ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
            >
              {cat}
            </button>
          ))}
        </div>

        {docsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-white/30 mx-auto mb-2" />
                <p className="text-sm text-white/35">No documents found</p>
                <p className="text-xs text-white/25">Upload a document to get started</p>
              </div>
            ) : (
              filtered.map((doc, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors group hover:bg-white/[0.03]"
                  style={{ background: "rgba(255,255,255,0.015)" }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                    {getFileIcon(doc.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/35">{doc.size}</span>
                      <span className="text-xs text-white/35">·</span>
                      <span className="text-xs text-white/35">{doc.date}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>{doc.category}</span>
                    </div>
                  </div>
                  {getStatusBadge(doc.status)}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                    {(() => {
                      const action = getCategoryAction(doc.category);
                      return action ? (
                        <a
                          href={action.href}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors whitespace-nowrap border border-blue-500/20"
                          title={action.label}
                        >
                          {action.label}
                          <ChevronRight className="w-3 h-3" />
                        </a>
                      ) : null;
                    })()}
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                      disabled={!doc.fileUrl}
                      onClick={() => doc.fileUrl && window.open(doc.fileUrl, "_blank")} title={doc.fileUrl ? "View original file" : "No file available"}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {doc.fileUrl ? (
                      <a href={doc.fileUrl} download title="Download"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 opacity-40" disabled>
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </motion.div>

      <ModuleChat
        context="Document Intelligence"
        placeholder="Ask about documents, contracts, reports..."
        pageSummaryData={{
          totalDocs: realDocs.length || 248,
          processed: realDocs.filter(d => d.status === "processed").length || 231,
          docTypes: docTypeData,
        }}
      />
    </div>
  );
}
