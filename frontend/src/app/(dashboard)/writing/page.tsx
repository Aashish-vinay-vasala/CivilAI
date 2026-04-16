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
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const documentTypes = [
  { id: "letter", label: "Professional Letter", icon: FileText, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", desc: "Formal construction letters" },
  { id: "email", label: "Email Draft", icon: Mail, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "Professional email drafts" },
  { id: "notice", label: "Formal Notice", icon: AlertTriangle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "Site notices & warnings" },
  { id: "variation", label: "Variation Order", icon: GitBranch, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", desc: "Change order documents" },
  { id: "dispute", label: "Dispute Letter", icon: Scale, color: "text-red-400 bg-red-500/10 border-red-500/20", desc: "Legal dispute notices" },
  { id: "blueprint", label: "Blueprint Analysis", icon: Upload, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", desc: "Drawing & plan analysis" },
  { id: "contract", label: "Contract Analysis", icon: FileText, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", desc: "Contract document review" },
  { id: "boq", label: "BOQ Analysis", icon: FileText, color: "text-pink-400 bg-pink-500/10 border-pink-500/20", desc: "Bill of quantities review" },
];

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
        response = await axios.post("http://localhost:8000/api/v1/writing/letter", letterForm);
        setResult(response.data.letter);
      } else if (activeType === "email") {
        response = await axios.post("http://localhost:8000/api/v1/writing/email", emailForm);
        setResult(response.data.email);
      } else if (activeType === "notice") {
        response = await axios.post("http://localhost:8000/api/v1/writing/notice", noticeForm);
        setResult(response.data.notice);
      } else if (activeType === "variation") {
        response = await axios.post("http://localhost:8000/api/v1/writing/variation-order", variationForm);
        setResult(response.data.variation_order);
      } else if (activeType === "dispute") {
        response = await axios.post("http://localhost:8000/api/v1/writing/dispute-letter", disputeForm);
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
        response = await axios.post("http://localhost:8000/api/v1/writing/analyze-blueprint", formData);
        setResult(response.data.analysis);
      } else if (activeType === "contract") {
        response = await axios.post("http://localhost:8000/api/v1/writing/analyze-contract", formData);
        setResult(response.data.analysis);
      } else if (activeType === "boq") {
        response = await axios.post("http://localhost:8000/api/v1/writing/analyze-boq", formData);
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

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Writing Assistant</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered document generation & analysis
        </p>
      </motion.div>

      {/* Document Type Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {documentTypes.map((type, i) => (
          <motion.button
            key={type.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => { setActiveType(type.id); setResult(""); }}
            className={`p-4 rounded-2xl border text-left transition-all ${
              activeType === type.id
                ? type.color
                : "border-border bg-card hover:bg-secondary/50"
            }`}
          >
            <type.icon className={`w-5 h-5 mb-2 ${activeType === type.id ? type.color.split(" ")[0] : "text-muted-foreground"}`} />
            <p className="text-sm font-medium text-foreground">{type.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{type.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Forms */}
      <motion.div
        key={activeType}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        {/* Letter Form */}
        {activeType === "letter" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Professional Letter Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Letter Type</label>
                <select value={letterForm.letter_type} onChange={(e) => setLetterForm({ ...letterForm, letter_type: e.target.value })} className={inputClass}>
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
                <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
                <input placeholder="e.g. CivilAI Tower" value={letterForm.project_name} onChange={(e) => setLetterForm({ ...letterForm, project_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">From Name</label>
                <input placeholder="Your name" value={letterForm.from_name} onChange={(e) => setLetterForm({ ...letterForm, from_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">From Company</label>
                <input placeholder="Your company" value={letterForm.from_company} onChange={(e) => setLetterForm({ ...letterForm, from_company: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">To Name</label>
                <input placeholder="Recipient name" value={letterForm.to_name} onChange={(e) => setLetterForm({ ...letterForm, to_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">To Company</label>
                <input placeholder="Recipient company" value={letterForm.to_company} onChange={(e) => setLetterForm({ ...letterForm, to_company: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Subject</label>
                <input placeholder="Letter subject" value={letterForm.subject} onChange={(e) => setLetterForm({ ...letterForm, subject: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Key Points</label>
                <textarea placeholder="Main points to include..." value={letterForm.key_points} onChange={(e) => setLetterForm({ ...letterForm, key_points: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Tone</label>
                <select value={letterForm.tone} onChange={(e) => setLetterForm({ ...letterForm, tone: e.target.value })} className={inputClass}>
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
            <h3 className="font-semibold text-foreground">Email Draft Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Email Type</label>
                <select value={emailForm.email_type} onChange={(e) => setEmailForm({ ...emailForm, email_type: e.target.value })} className={inputClass}>
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
                <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={emailForm.project_name} onChange={(e) => setEmailForm({ ...emailForm, project_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">From</label>
                <input placeholder="Your name" value={emailForm.from_name} onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">To</label>
                <input placeholder="Recipient name" value={emailForm.to_name} onChange={(e) => setEmailForm({ ...emailForm, to_name: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Subject</label>
                <input placeholder="Email subject" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Key Points</label>
                <textarea placeholder="Main points to cover..." value={emailForm.key_points} onChange={(e) => setEmailForm({ ...emailForm, key_points: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>
        )}

        {/* Notice Form */}
        {activeType === "notice" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Formal Notice Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Notice Type</label>
                <select value={noticeForm.notice_type} onChange={(e) => setNoticeForm({ ...noticeForm, notice_type: e.target.value })} className={inputClass}>
                  <option>Safety Warning</option>
                  <option>Stop Work Order</option>
                  <option>Default Notice</option>
                  <option>Termination Notice</option>
                  <option>Suspension Notice</option>
                  <option>Defect Notice</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={noticeForm.project_name} onChange={(e) => setNoticeForm({ ...noticeForm, project_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Issued By</label>
                <input placeholder="Your name/company" value={noticeForm.issued_by} onChange={(e) => setNoticeForm({ ...noticeForm, issued_by: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Issued To</label>
                <input placeholder="Recipient" value={noticeForm.issued_to} onChange={(e) => setNoticeForm({ ...noticeForm, issued_to: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Details</label>
                <textarea placeholder="Notice details..." value={noticeForm.details} onChange={(e) => setNoticeForm({ ...noticeForm, details: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>
        )}

        {/* Variation Order Form */}
        {activeType === "variation" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Variation Order Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={variationForm.project_name} onChange={(e) => setVariationForm({ ...variationForm, project_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">VO Number</label>
                <input placeholder="e.g. VO-001" value={variationForm.vo_number} onChange={(e) => setVariationForm({ ...variationForm, vo_number: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Requested By</label>
                <input placeholder="Name/Company" value={variationForm.requested_by} onChange={(e) => setVariationForm({ ...variationForm, requested_by: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Cost Impact</label>
                <input placeholder="e.g. +$50,000" value={variationForm.cost_impact} onChange={(e) => setVariationForm({ ...variationForm, cost_impact: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Time Impact</label>
                <input placeholder="e.g. +14 days" value={variationForm.time_impact} onChange={(e) => setVariationForm({ ...variationForm, time_impact: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Description of Change</label>
                <textarea placeholder="Describe the variation..." value={variationForm.description} onChange={(e) => setVariationForm({ ...variationForm, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>
        )}

        {/* Dispute Form */}
        {activeType === "dispute" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Dispute Letter Generator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
                <input placeholder="Project name" value={disputeForm.project_name} onChange={(e) => setDisputeForm({ ...disputeForm, project_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Dispute Type</label>
                <select value={disputeForm.dispute_type} onChange={(e) => setDisputeForm({ ...disputeForm, dispute_type: e.target.value })} className={inputClass}>
                  <option>Payment Dispute</option>
                  <option>Delay Claim</option>
                  <option>Defect Claim</option>
                  <option>Scope Dispute</option>
                  <option>Termination Dispute</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Amount in Dispute</label>
                <input placeholder="e.g. $150,000" value={disputeForm.amount} onChange={(e) => setDisputeForm({ ...disputeForm, amount: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Our Position</label>
                <textarea placeholder="Your position in the dispute..." value={disputeForm.our_position} onChange={(e) => setDisputeForm({ ...disputeForm, our_position: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Evidence</label>
                <textarea placeholder="Supporting evidence..." value={disputeForm.evidence} onChange={(e) => setDisputeForm({ ...disputeForm, evidence: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>
        )}

        {/* File Upload Types */}
        {["blueprint", "contract", "boq"].includes(activeType) && (
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">
              {activeType === "blueprint" ? "Blueprint / Drawing Analysis" :
               activeType === "contract" ? "Contract Document Analysis" :
               "Bill of Quantities Analysis"}
            </h3>
            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors border-border hover:border-blue-500/50`}>
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">Upload document to analyze</p>
              <p className="text-sm text-muted-foreground mb-4">
                {activeType === "blueprint" ? "Supports PNG, JPG, PDF drawings" :
                 "Supports PDF, Word, Excel documents"}
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept={activeType === "blueprint" ? ".png,.jpg,.jpeg,.pdf" : ".pdf,.docx,.xlsx"}
                  onChange={handleFileUpload}
                />
                <Button className="gradient-blue text-white border-0">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload & Analyze
                </Button>
              </label>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {!["blueprint", "contract", "boq"].includes(activeType) && (
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="gradient-blue text-white border-0 mt-4"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate Document
          </Button>
        )}
      </motion.div>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">Generated Document</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyResult}>
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadResult}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          </div>
          <div className="bg-secondary rounded-xl p-4">
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">
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