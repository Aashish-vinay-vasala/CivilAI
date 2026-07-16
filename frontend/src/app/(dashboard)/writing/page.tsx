"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Mail,
  AlertTriangle,
  GitBranch,
  Scale,
  Upload,
  Loader2,
  Copy,
  Check,
  Download,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const ACCENT: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.18)",   text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)",  text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",   text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)",  text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  blue:   { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)",  text: "#3B82F6", shadow: "rgba(59,130,246,0.15)" },
  orange: { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)",  text: "#F97316", shadow: "rgba(249,115,22,0.15)" },
  purple: { bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)",  text: "#8B5CF6", shadow: "rgba(139,92,246,0.15)" },
  teal:   { bg: "rgba(20,184,166,0.07)",  border: "rgba(20,184,166,0.18)",  text: "#14B8A6", shadow: "rgba(20,184,166,0.15)" },
};

const documentTypes = [
  { id: "letter", label: "Professional Letter", icon: FileText, accent: "blue", desc: "Formal construction letters" },
  { id: "email", label: "Email Draft", icon: Mail, accent: "teal", desc: "Professional email drafts" },
  { id: "notice", label: "Formal Notice", icon: AlertTriangle, accent: "orange", desc: "Site notices & warnings" },
  { id: "variation", label: "Variation Order", icon: GitBranch, accent: "green", desc: "Change order documents" },
  { id: "dispute", label: "Dispute Letter", icon: Scale, accent: "red", desc: "Legal dispute notices" },
  { id: "blueprint", label: "Blueprint Analysis", icon: Upload, accent: "cyan", desc: "Drawing & plan analysis" },
  { id: "contract", label: "Contract Analysis", icon: FileText, accent: "purple", desc: "Contract document review" },
  { id: "boq", label: "BOQ Analysis", icon: FileText, accent: "amber", desc: "Bill of quantities review" },
];

const inputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const ctaStyle = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,100,160,0.15))",
  border: "1px solid rgba(0,212,255,0.3)",
  boxShadow: "0 0 20px rgba(0,212,255,0.12)",
};

const ghostBtnStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};

export default function WritingPage() {
  const [activeType, setActiveType] = useState("letter");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const [letterForm, setLetterForm] = useState({
    letter_type: "Delay Notification",
    from_name: "", from_company: "",
    to_name: "", to_company: "",
    project_name: "", subject: "",
    key_points: "", tone: "Professional",
  });

  const [emailForm, setEmailForm] = useState({
    email_type: "Progress Update",
    from_name: "", to_name: "",
    project_name: "", subject: "",
    key_points: "", tone: "Professional",
  });

  const [noticeForm, setNoticeForm] = useState({
    notice_type: "Safety Warning",
    project_name: "", issued_by: "",
    issued_to: "", details: "",
  });

  const [variationForm, setVariationForm] = useState({
    project_name: "", vo_number: "",
    requested_by: "", description: "",
    cost_impact: "", time_impact: "",
  });

  const [disputeForm, setDisputeForm] = useState({
    project_name: "", dispute_type: "",
    our_position: "", evidence: "",
    amount: "",
  });

  const handleSubmit = async () => {
    setLoading(true);
    setResult("");
    try {
      let response;
      if (activeType === "letter") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/letter`, letterForm);
        setResult(response.data.letter);
      } else if (activeType === "email") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/email`, emailForm);
        setResult(response.data.email);
      } else if (activeType === "notice") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/notice`, noticeForm);
        setResult(response.data.notice);
      } else if (activeType === "variation") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/variation-order`, variationForm);
        setResult(response.data.variation_order);
      } else if (activeType === "dispute") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/dispute-letter`, disputeForm);
        setResult(response.data.letter);
      }
      toast.success("Document generated!");
    } catch {
      toast.error("Failed to generate document");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      let response;
      if (activeType === "blueprint") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/analyze-blueprint`, formData);
        setResult(response.data.analysis);
      } else if (activeType === "contract") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/analyze-contract`, formData);
        setResult(response.data.analysis);
      } else if (activeType === "boq") {
        response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/writing/analyze-boq`, formData);
        setResult(response.data.analysis);
      }
      toast.success("Document analyzed!");
    } catch {
      toast.error("Failed to analyze document");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const downloadResult = () => {
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeType}_${Date.now()}.txt`;
    a.click();
    toast.success("Downloaded!");
  };

  const activeAccent = ACCENT[documentTypes.find((t) => t.id === activeType)?.accent ?? "cyan"];

  return (
    <div className="flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold text-white tracking-tight">Writing Assistant</h1>
        <p className="text-white/35 text-[13px] mt-1">
          AI-powered document generation &amp; analysis
        </p>
      </motion.div>

      {/* Document Type Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {documentTypes.map((type, i) => {
          const a = ACCENT[type.accent];
          const active = activeType === type.id;
          return (
            <motion.button
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { setActiveType(type.id); setResult(""); }}
              className="p-4 rounded-2xl border text-left transition-all"
              style={active
                ? { background: a.bg, borderColor: a.border, boxShadow: `0 0 16px ${a.shadow}` }
                : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <type.icon className="w-5 h-5 mb-2" style={{ color: active ? a.text : "rgba(255,255,255,0.35)" }} />
              <p className="text-sm font-medium text-white">{type.label}</p>
              <p className="text-[12px] text-white/35 mt-0.5">{type.desc}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Forms */}
      <motion.div
        key={activeType}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        {/* Letter Form */}
        {activeType === "letter" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Professional Letter Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Letter Type</label>
                <select value={letterForm.letter_type} onChange={(e) => setLetterForm({ ...letterForm, letter_type: e.target.value })} className={inputClass} style={inputStyle}>
                  <option>Delay Notification</option>
                  <option>Payment Request</option>
                  <option>Site Instruction</option>
                  <option>Claim Letter</option>
                  <option>Completion Notice</option>
                  <option>Warning Letter</option>
                  <option>Appointment Letter</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Project Name</label>
                <input placeholder="e.g. CivilAI Tower" value={letterForm.project_name} onChange={(e) => setLetterForm({ ...letterForm, project_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">From Name</label>
                <input placeholder="Your name" value={letterForm.from_name} onChange={(e) => setLetterForm({ ...letterForm, from_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">From Company</label>
                <input placeholder="Your company" value={letterForm.from_company} onChange={(e) => setLetterForm({ ...letterForm, from_company: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">To Name</label>
                <input placeholder="Recipient name" value={letterForm.to_name} onChange={(e) => setLetterForm({ ...letterForm, to_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">To Company</label>
                <input placeholder="Recipient company" value={letterForm.to_company} onChange={(e) => setLetterForm({ ...letterForm, to_company: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Subject</label>
                <input placeholder="Letter subject" value={letterForm.subject} onChange={(e) => setLetterForm({ ...letterForm, subject: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Key Points</label>
                <textarea placeholder="Main points to include..." value={letterForm.key_points} onChange={(e) => setLetterForm({ ...letterForm, key_points: e.target.value })} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Tone</label>
                <select value={letterForm.tone} onChange={(e) => setLetterForm({ ...letterForm, tone: e.target.value })} className={inputClass} style={inputStyle}>
                  <option>Professional</option>
                  <option>Formal</option>
                  <option>Firm</option>
                  <option>Urgent</option>
                  <option>Diplomatic</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Email Form */}
        {activeType === "email" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Email Draft Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Email Type</label>
                <select value={emailForm.email_type} onChange={(e) => setEmailForm({ ...emailForm, email_type: e.target.value })} className={inputClass} style={inputStyle}>
                  <option>Progress Update</option>
                  <option>Meeting Request</option>
                  <option>Delay Notification</option>
                  <option>Payment Follow-up</option>
                  <option>Issue Escalation</option>
                  <option>Document Submittal</option>
                  <option>RFI Response</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={emailForm.project_name} onChange={(e) => setEmailForm({ ...emailForm, project_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">From</label>
                <input placeholder="Your name" value={emailForm.from_name} onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">To</label>
                <input placeholder="Recipient name" value={emailForm.to_name} onChange={(e) => setEmailForm({ ...emailForm, to_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Subject</label>
                <input placeholder="Email subject" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Key Points</label>
                <textarea placeholder="Main points to cover..." value={emailForm.key_points} onChange={(e) => setEmailForm({ ...emailForm, key_points: e.target.value })} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* Notice Form */}
        {activeType === "notice" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Formal Notice Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Notice Type</label>
                <select value={noticeForm.notice_type} onChange={(e) => setNoticeForm({ ...noticeForm, notice_type: e.target.value })} className={inputClass} style={inputStyle}>
                  <option>Safety Warning</option>
                  <option>Stop Work Order</option>
                  <option>Default Notice</option>
                  <option>Termination Notice</option>
                  <option>Suspension Notice</option>
                  <option>Defect Notice</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={noticeForm.project_name} onChange={(e) => setNoticeForm({ ...noticeForm, project_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Issued By</label>
                <input placeholder="Your name/company" value={noticeForm.issued_by} onChange={(e) => setNoticeForm({ ...noticeForm, issued_by: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Issued To</label>
                <input placeholder="Recipient" value={noticeForm.issued_to} onChange={(e) => setNoticeForm({ ...noticeForm, issued_to: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Details</label>
                <textarea placeholder="Notice details..." value={noticeForm.details} onChange={(e) => setNoticeForm({ ...noticeForm, details: e.target.value })} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* Variation Order Form */}
        {activeType === "variation" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Variation Order Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={variationForm.project_name} onChange={(e) => setVariationForm({ ...variationForm, project_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">VO Number</label>
                <input placeholder="e.g. VO-001" value={variationForm.vo_number} onChange={(e) => setVariationForm({ ...variationForm, vo_number: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Requested By</label>
                <input placeholder="Name/Company" value={variationForm.requested_by} onChange={(e) => setVariationForm({ ...variationForm, requested_by: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Cost Impact</label>
                <input placeholder="e.g. +$50,000" value={variationForm.cost_impact} onChange={(e) => setVariationForm({ ...variationForm, cost_impact: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Time Impact</label>
                <input placeholder="e.g. +14 days" value={variationForm.time_impact} onChange={(e) => setVariationForm({ ...variationForm, time_impact: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Description of Change</label>
                <textarea placeholder="Describe the variation..." value={variationForm.description} onChange={(e) => setVariationForm({ ...variationForm, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* Dispute Form */}
        {activeType === "dispute" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Dispute Letter Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={disputeForm.project_name} onChange={(e) => setDisputeForm({ ...disputeForm, project_name: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Dispute Type</label>
                <select value={disputeForm.dispute_type} onChange={(e) => setDisputeForm({ ...disputeForm, dispute_type: e.target.value })} className={inputClass} style={inputStyle}>
                  <option>Payment Dispute</option>
                  <option>Delay Claim</option>
                  <option>Defect Claim</option>
                  <option>Scope Dispute</option>
                  <option>Termination Dispute</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block">Amount in Dispute</label>
                <input placeholder="e.g. $150,000" value={disputeForm.amount} onChange={(e) => setDisputeForm({ ...disputeForm, amount: e.target.value })} className={inputClass} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Our Position</label>
                <textarea placeholder="Your position in the dispute..." value={disputeForm.our_position} onChange={(e) => setDisputeForm({ ...disputeForm, our_position: e.target.value })} rows={2} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block">Evidence</label>
                <textarea placeholder="Supporting evidence..." value={disputeForm.evidence} onChange={(e) => setDisputeForm({ ...disputeForm, evidence: e.target.value })} rows={2} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* File Upload Types */}
        {["blueprint", "contract", "boq"].includes(activeType) && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">
              {activeType === "blueprint" ? "Blueprint / Drawing Analysis" :
               activeType === "contract" ? "Contract Document Analysis" :
               "Bill of Quantities Analysis"}
            </h3>
            <div className="border-2 border-dashed rounded-xl p-8 text-center transition-colors border-white/10 hover:border-[rgba(0,212,255,0.5)]">
              <Upload className="w-10 h-10 text-white/30 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Upload document to analyze</p>
              <p className="text-sm text-white/35 mb-4">
                {activeType === "blueprint" ? "Supports PNG, JPG, PDF drawings" :
                 "Supports PDF, Word, Excel documents"}
              </p>
              <label className="cursor-pointer inline-flex">
                <input
                  type="file"
                  className="hidden"
                  accept={activeType === "blueprint" ? ".png,.jpg,.jpeg,.pdf" : ".pdf,.docx,.xlsx"}
                  onChange={handleFileUpload}
                />
                <span
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
                  style={ctaStyle}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload &amp; Analyze
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {!["blueprint", "contract", "boq"].includes(activeType) && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 mt-4"
            style={ctaStyle}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Document
          </button>
        )}
      </motion.div>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: activeAccent.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: activeAccent.text }} />
              <h3 className="font-semibold text-white">Generated Document</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyResult}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
                style={ghostBtnStyle}
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={downloadResult}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
                style={ghostBtnStyle}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </button>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <pre className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed font-sans">
              {result}
            </pre>
          </div>
        </motion.div>
      )}

      <ModuleChat
        context="Writing Assistant"
        placeholder="Ask about document generation, templates..."
        pageSummaryData={{
          activeType,
          availableDocuments: documentTypes.map(d => d.label),
        }}
      />
    </div>
  );
}
