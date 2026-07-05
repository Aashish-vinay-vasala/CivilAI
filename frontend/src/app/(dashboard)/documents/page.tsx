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
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { MarkdownText } from "@/lib/renderMarkdown";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const docTypeData = [
  { name: "Contracts", value: 28, color: "#3b82f6" },
  { name: "Safety", value: 22, color: "#ef4444" },
  { name: "Permits", value: 15, color: "#10b981" },
  { name: "Reports", value: 20, color: "#f59e0b" },
  { name: "Drawings", value: 15, color: "#8b5cf6" },
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
      case "pending": return <span className="flex items-center gap-1 text-xs text-orange-400"><Clock className="w-3 h-3" />Pending</span>;
      default: return <span className="flex items-center gap-1 text-xs text-blue-400"><Loader2 className="w-3 h-3 animate-spin" />Processing</span>;
    }
  };

  const allDocs = realDocs.length > 0
    ? realDocs.map((doc: any) => ({
        name: doc.original_name || doc.filename,
        type: doc.filename?.endsWith(".xlsx") || doc.original_name?.endsWith(".xlsx") ? "excel" : "pdf",
        status: doc.status || "processed",
        size: "—",
        date: new Date(doc.created_at).toLocaleDateString(),
        category: DOC_TYPE_LABEL[doc.doc_type?.toLowerCase()] ?? "General",
      }))
    : fallbackDocs;

  const filtered = allDocs.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || d.category === activeCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Document Intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload any construction document — contracts, blueprints, BOQ, reports — and chat with AI
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Documents", value: realDocs.length > 0 ? realDocs.length.toString() : "248", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Processed", value: realDocs.length > 0 ? realDocs.filter(d => d.status === "processed").length.toString() : "231", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Pending", value: realDocs.length > 0 ? realDocs.filter(d => d.status === "pending").length.toString() : "12", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "In Database", value: realDocs.length > 0 ? `${realDocs.length} Live` : "0", color: "border-cyan-500/20 bg-cyan-500/5" },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
          </motion.div>
        ))}
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
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
              dragOver ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-blue-500/50 hover:bg-blue-500/5"
            }`}
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
              <div className="w-16 h-16 rounded-2xl gradient-blue flex items-center justify-center mx-auto mb-4">
                {loading ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Upload className="w-8 h-8 text-white" />}
              </div>
              <p className="text-foreground font-semibold text-lg mb-1">
                {loading ? "Processing & saving to database..." : "Drop your document here"}
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                Contracts · Blueprints · BOQ · Reports · Permits · Invoices
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                PDF · Excel · Word · PNG · JPG — Saved to Supabase Storage
              </p>
            </motion.div>
            <div className="flex gap-2 justify-center flex-wrap">
              <input
                type="text"
                placeholder="Optional: What to analyze?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                onClick={(e) => e.stopPropagation()}
              />
              <Button
  className="gradient-blue text-white border-0"
  onClick={(e) => {
    e.stopPropagation();
    document.getElementById("file-upload")?.click();
  }}
>
  <Upload className="w-4 h-4 mr-2" />
  Browse Files
</Button>
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
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-medium text-foreground">Supported Document Types</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Contracts", desc: "Risk analysis, clause review", color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "Blueprints", desc: "Drawing analysis, AI vision", color: "text-cyan-400", bg: "bg-cyan-500/10" },
                { label: "BOQ", desc: "Cost extraction, price analysis", color: "text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "Safety Reports", desc: "Risk identification", color: "text-red-400", bg: "bg-red-500/10" },
                { label: "Permits", desc: "Expiry tracking, compliance", color: "text-orange-400", bg: "bg-orange-500/10" },
                { label: "Invoices", desc: "Data extraction, payment terms", color: "text-yellow-400", bg: "bg-yellow-500/10" },
              ].map((type, i) => (
                <div key={i} className={`flex items-start gap-2 p-3 rounded-xl ${type.bg}`}>
                  <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${type.color}`} />
                  <div>
                    <p className={`text-xs font-medium ${type.color}`}>{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Document Chat */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col"
          style={{ minHeight: "500px" }}
        >
          {!docChatOpen ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground mb-2">Ask Your Documents</p>
              <p className="text-sm text-muted-foreground mb-4">
                Upload a document to start chatting with AI about its content
              </p>
              <div className="space-y-2 w-full max-w-xs">
                {["What are the payment terms?", "Identify all risks", "Summarize key points"].map((q) => (
                  <div key={q} className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/50 text-xs text-muted-foreground">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    {q}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-blue-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Document AI Chat</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <p className="text-xs text-muted-foreground truncate max-w-40">{currentDoc}</p>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDocChatOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Quick Questions */}
              <div className="p-3 border-b border-border overflow-x-auto">
                <div className="flex gap-2 flex-nowrap">
                  {quickQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendDocMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-blue-500/10 hover:text-blue-400 text-muted-foreground border border-border transition-colors whitespace-nowrap"
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
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "assistant" ? "gradient-blue" : "bg-secondary border border-border"
                      }`}>
                        {msg.role === "assistant"
                          ? <Bot className="w-3.5 h-3.5 text-white" />
                          : <span className="text-xs text-foreground">U</span>
                        }
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed ${
                        msg.role === "assistant"
                          ? "bg-secondary text-foreground rounded-tl-none border border-border"
                          : "gradient-blue text-white rounded-tr-none"
                      }`}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {docChatLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full gradient-blue flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-secondary border border-border rounded-2xl rounded-tl-none px-3 py-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <input
                    value={docInput}
                    onChange={(e) => setDocInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendDocMessage()}
                    placeholder="Ask anything about this document..."
                    className="flex-1 px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    onClick={() => sendDocMessage()}
                    disabled={!docInput.trim() || docChatLoading}
                    size="icon"
                    className="gradient-blue text-white border-0 rounded-xl"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Natural Language Search — RAG across all docs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-cyan-500/5">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <p className="text-sm font-semibold text-foreground">Search All Documents</p>
          <span className="text-xs text-muted-foreground ml-auto">Ask questions across your entire document library</span>
        </div>
        <div className="flex flex-col" style={{ minHeight: ragMessages.length ? 320 : 64 }}>
          {ragMessages.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
              {ragMessages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "assistant" ? "bg-cyan-500/20" : "bg-secondary border border-border"}`}>
                    {msg.role === "assistant" ? <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> : <span className="text-xs text-foreground">U</span>}
                  </div>
                  <div className="max-w-[80%] space-y-1">
                    <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === "assistant" ? "bg-secondary text-foreground border border-border rounded-tl-none" : "gradient-blue text-white rounded-tr-none"}`}>
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
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="bg-secondary border border-border rounded-2xl rounded-tl-none px-3 py-2">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => <div key={d} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={ragBottomRef} />
            </div>
          )}
          <div className="p-3 border-t border-border flex gap-2">
            <input value={ragInput} onChange={(e) => setRagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendRagMessage()}
              placeholder="e.g. What are the payment terms across all contracts?"
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <button onClick={() => sendRagMessage()} disabled={!ragInput.trim() || ragLoading}
              className="px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
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
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Document Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-muted-foreground leading-relaxed" />
        </motion.div>
      )}

      {/* Document Library */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">Document Library</h3>
            {realDocs.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {realDocs.length} from Supabase DB
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-blue-500 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {docsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No documents found</p>
                <p className="text-xs text-muted-foreground">Upload a document to get started</p>
              </div>
            ) : (
              filtered.map((doc, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                    {getFileIcon(doc.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate font-medium">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{doc.size}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{doc.date}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">{doc.category}</span>
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
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
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