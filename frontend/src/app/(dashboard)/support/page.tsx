"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeadphonesIcon, Plus, Send, Loader2, CheckCircle2, Clock,
  AlertCircle, ChevronRight, Bot, User, Shield, Tag, Zap,
  RefreshCw, X, MessageSquare,
} from "lucide-react";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  user_email: string;
  user_name: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  ai_resolved: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender: "user" | "ai" | "agent";
  sender_name: string;
  message: string;
  created_at: string;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

const priorityColors: Record<string, string> = {
  low:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-400   bg-amber-500/10   border-amber-500/20",
  high:   "text-orange-400  bg-orange-500/10  border-orange-500/20",
  urgent: "text-red-400     bg-red-500/10     border-red-500/20",
};

const statusConfig: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  open:        { label: "Open",        color: "text-cyan-400  bg-cyan-500/10  border-cyan-500/20",    Icon: Clock },
  in_progress: { label: "In Progress", color: "text-blue-400  bg-blue-500/10  border-blue-500/20",    Icon: Loader2 },
  resolved:    { label: "Resolved",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2 },
  closed:      { label: "Closed",      color: "text-white/30  bg-white/5      border-white/10",        Icon: X },
};

const categoryLabels: Record<string, string> = {
  technical:       "Technical",
  billing:         "Billing",
  feature_request: "Feature Request",
  training:        "Training",
  account:         "Account",
  project_data:    "Project Data",
  general:         "General",
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60)   return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

// ── New Ticket Form ───────────────────────────────────────────────────────────

function NewTicketForm({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Ticket) => void }) {
  const [name, setName]        = useState("");
  const [email, setEmail]      = useState("");
  const [subject, setSubject]  = useState("");
  const [desc, setDesc]        = useState("");
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");

  async function submit() {
    if (!email.trim() || !subject.trim() || !desc.trim()) {
      setError("Email, subject, and description are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API}/api/v1/support/tickets`, {
        user_email:  email.trim(),
        user_name:   name.trim() || "Anonymous",
        subject:     subject.trim(),
        description: desc.trim(),
      });
      onCreated(res.data.ticket);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to submit ticket.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg rounded-2xl p-6 space-y-4"
        style={{
          background: "rgba(4,11,25,0.98)",
          border: "1px solid rgba(0,212,255,0.15)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeadphonesIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-semibold">New Support Ticket</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-white/40 mb-1">Your Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div>
            <label className="block text-[11px] text-white/40 mb-1">Email *</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              className="w-full rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-white/40 mb-1">Subject *</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue"
            className="w-full rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        <div>
          <label className="block text-[11px] text-white/40 mb-1">Description *</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe your issue in detail — include any error messages, steps to reproduce, or screenshots if relevant."
            rows={5}
            className="w-full rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {error && (
          <p className="text-red-400 text-[12px] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-[13px] text-white/50 hover:text-white/80 transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
            style={{
              background: loading ? "rgba(0,212,255,0.1)" : "rgba(0,212,255,0.15)",
              border: "1px solid rgba(0,212,255,0.3)",
              color: "#00D4FF",
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? "Submitting…" : "Submit Ticket"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Conversation Thread ────────────────────────────────────────────────────────

function ThreadBubble({ msg }: { msg: Message }) {
  const isUser  = msg.sender === "user";
  const isAI    = msg.sender === "ai";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isAI
            ? "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(0,100,160,0.12))"
            : isUser
            ? "linear-gradient(135deg,#1D4ED8,#1e40af)"
            : "rgba(255,255,255,0.08)",
          border: isAI ? "1px solid rgba(0,212,255,0.25)" : "none",
        }}
      >
        {isAI ? (
          <Bot className="w-4 h-4 text-cyan-400" />
        ) : isUser ? (
          <User className="w-4 h-4 text-blue-200" />
        ) : (
          <Shield className="w-4 h-4 text-white/60" />
        )}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/30">
            {msg.sender_name || (isAI ? "CivilAI Support" : "Agent")}
          </span>
          <span className="text-[10px] text-white/20">{formatTime(msg.created_at)}</span>
        </div>
        <div
          className="px-4 py-3 rounded-2xl text-[13px] leading-relaxed text-white/85 whitespace-pre-wrap"
          style={{
            background: isUser
              ? "rgba(29,78,216,0.2)"
              : isAI
              ? "rgba(0,212,255,0.06)"
              : "rgba(255,255,255,0.05)",
            border: isUser
              ? "1px solid rgba(29,78,216,0.3)"
              : isAI
              ? "1px solid rgba(0,212,255,0.12)"
              : "1px solid rgba(255,255,255,0.08)",
            borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
          }}
        >
          {msg.message}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [tickets, setTickets]           = useState<Ticket[]>([]);
  const [selected, setSelected]         = useState<Ticket | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [reply, setReply]               = useState("");
  const [senderName, setSenderName]     = useState("");
  const [senderEmail, setSenderEmail]   = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [showNewForm, setShowNewForm]   = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [aiTyping, setAiTyping]         = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    setLoadingTickets(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "all") params.status = filterStatus;
      const res = await axios.get(`${API}/api/v1/support/tickets`, { params });
      setTickets(res.data.tickets || []);
    } catch { /* silent */ } finally {
      setLoadingTickets(false);
    }
  }

  async function loadMessages(ticketId: string) {
    setLoadingMsgs(true);
    try {
      const res = await axios.get(`${API}/api/v1/support/tickets/${ticketId}/messages`);
      setMessages(res.data.messages || []);
    } catch { /* silent */ } finally {
      setLoadingMsgs(false);
    }
  }

  useEffect(() => { loadTickets(); }, [filterStatus]);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
    else setMessages([]);
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setSendingReply(true);
    setAiTyping(false);
    const text = reply.trim();
    setReply("");

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      ticket_id: selected.id,
      sender: "user",
      sender_name: senderName || "You",
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);
    setAiTyping(true);

    try {
      const res = await axios.post(
        `${API}/api/v1/support/tickets/${selected.id}/messages`,
        { sender: "user", sender_name: senderName || "You", message: text },
      );
      setAiTyping(false);
      await loadMessages(selected.id);
      if (res.data.ai_reply) {
        // message already inserted server-side, just reload
      }
    } catch {
      setAiTyping(false);
      setMessages((p) => p.filter((m) => m.id !== optimistic.id));
      setReply(text);
    } finally {
      setSendingReply(false);
    }
  }

  function handleTicketCreated(ticket: Ticket) {
    setShowNewForm(false);
    setTickets((p) => [ticket, ...p]);
    setSelected(ticket);
  }

  const filtered = filterStatus === "all"
    ? tickets
    : tickets.filter((t) => t.status === filterStatus);

  const statusTabs = ["all", "open", "in_progress", "resolved", "closed"];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Left panel: ticket list ─────────────────────────────────────── */}
      <div
        className="w-80 shrink-0 flex flex-col border-r"
        style={{ borderColor: "rgba(0,212,255,0.07)", background: "rgba(2,7,18,0.5)" }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HeadphonesIcon className="w-5 h-5 text-cyan-400" />
              <h1 className="text-white font-semibold text-[15px]">Support</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadTickets}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: "rgba(0,212,255,0.1)",
                  border: "1px solid rgba(0,212,255,0.25)",
                  color: "#00D4FF",
                }}
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {statusTabs.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  filterStatus === s
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                    : "text-white/25 hover:text-white/50"
                }`}
              >
                {s === "all" ? "All" : s === "in_progress" ? "Active" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1.5">
          {loadingTickets ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-500/40" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 gap-2">
              <MessageSquare className="w-8 h-8" />
              <p className="text-[13px]">No tickets found</p>
            </div>
          ) : (
            filtered.map((ticket) => {
              const sc = statusConfig[ticket.status] ?? statusConfig.open;
              const isActive = selected?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  onClick={() => setSelected(ticket)}
                  className="w-full text-left rounded-xl px-3 py-3 transition-all"
                  style={{
                    background: isActive ? "rgba(0,212,255,0.07)" : "transparent",
                    border: isActive ? "1px solid rgba(0,212,255,0.15)" : "1px solid transparent",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[12px] font-medium truncate leading-tight">
                        {ticket.subject}
                      </p>
                      <p className="text-white/35 text-[11px] mt-0.5 truncate">
                        {ticket.user_name} · {formatTime(ticket.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-white/20 shrink-0 mt-0.5" />
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide border ${sc.color}`}
                    >
                      <sc.Icon className="w-2.5 h-2.5" />
                      {sc.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase border ${priorityColors[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                    {ticket.ai_resolved && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> AI
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] text-white/25 bg-white/5 border border-white/8">
                      {categoryLabels[ticket.category] ?? ticket.category}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel: conversation thread ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20"
            >
              <HeadphonesIcon className="w-16 h-16 opacity-30" />
              <div className="text-center space-y-1">
                <p className="text-[15px] font-medium text-white/30">Select a ticket</p>
                <p className="text-[13px]">or create a new one to get started</p>
              </div>
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                style={{
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.2)",
                  color: "#00D4FF",
                }}
              >
                <Plus className="w-4 h-4" /> New Support Ticket
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Thread header */}
              <div
                className="px-6 py-4 shrink-0 flex items-start gap-4 border-b"
                style={{ borderColor: "rgba(0,212,255,0.07)", background: "rgba(2,7,18,0.4)" }}
              >
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold text-[15px] leading-tight truncate">{selected.subject}</h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {(() => {
                      const sc = statusConfig[selected.status] ?? statusConfig.open;
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sc.color}`}>
                          <sc.Icon className="w-3 h-3" /> {sc.label}
                        </span>
                      );
                    })()}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${priorityColors[selected.priority]}`}>
                      {selected.priority} priority
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-white/30">
                      <Tag className="w-3 h-3" />
                      {categoryLabels[selected.category] ?? selected.category}
                    </span>
                    <span className="text-[10px] text-white/25">#{selected.id.slice(0, 8)}</span>
                  </div>
                </div>
                {selected.ai_resolved && (
                  <div
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
                    style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa" }}
                  >
                    <Zap className="w-3 h-3" /> AI Resolved
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-500/40" />
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => <ThreadBubble key={msg.id} msg={msg} />)}

                    {aiTyping && (
                      <div className="flex gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(0,100,160,0.12))",
                            border: "1px solid rgba(0,212,255,0.25)",
                          }}
                        >
                          <Bot className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div
                          className="px-4 py-3 rounded-2xl text-[13px] text-white/50 flex items-center gap-1.5"
                          style={{
                            background: "rgba(0,212,255,0.06)",
                            border: "1px solid rgba(0,212,255,0.12)",
                            borderRadius: "4px 18px 18px 18px",
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {/* Reply box */}
              {selected.status !== "closed" && (
                <div
                  className="px-6 py-4 shrink-0 border-t space-y-2"
                  style={{ borderColor: "rgba(0,212,255,0.07)", background: "rgba(2,7,18,0.5)" }}
                >
                  {/* Sender info (compact) */}
                  <div className="flex gap-2">
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Your name"
                      className="w-36 rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 outline-none"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    />
                  </div>

                  <div className="flex gap-3 items-end">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
                      }}
                      placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      className="flex-1 rounded-xl px-4 py-3 text-[13px] text-white placeholder-white/20 outline-none resize-none"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={sendingReply || !reply.trim()}
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all mb-0.5"
                      style={{
                        background: reply.trim() ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.04)",
                        border: reply.trim() ? "1px solid rgba(0,212,255,0.3)" : "1px solid rgba(255,255,255,0.07)",
                        color: reply.trim() ? "#00D4FF" : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* New ticket modal */}
      <AnimatePresence>
        {showNewForm && (
          <NewTicketForm
            onClose={() => setShowNewForm(false)}
            onCreated={handleTicketCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
