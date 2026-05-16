"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search, X, ArrowRight,
  LayoutDashboard, DollarSign, Calendar, Users, FileText,
  Shield, FileSignature, ShoppingCart, ClipboardCheck, Boxes,
  Globe, Hammer, Wrench, Leaf, Star, LineChart, CreditCard,
  BarChart3, TrendingUp, Zap, AlertTriangle, PenTool, Cpu,
  GitBranch, CloudSun, Bot, Settings, MessageSquare, FileSpreadsheet,
  QrCode, UserPlus, Mic, Mail,
} from "lucide-react";
import { useActivityStore } from "@/lib/stores/activityStore";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  group: string;
  action: () => void;
  keywords?: string;
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const entries = useActivityStore((s) => s.entries);
  const recent = entries.slice(0, 5);

  const navigate = useCallback((href: string, label: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  const ITEMS: CommandItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Navigate", action: () => navigate("/dashboard", "Dashboard") },
    { id: "cost", label: "Cost & Budget", icon: DollarSign, group: "Navigate", action: () => navigate("/cost", "Cost") },
    { id: "scheduling", label: "Scheduling", icon: Calendar, group: "Navigate", action: () => navigate("/scheduling", "Scheduling") },
    { id: "workforce", label: "Workforce", icon: Users, group: "Navigate", action: () => navigate("/workforce", "Workforce") },
    { id: "documents", label: "Documents", icon: FileText, group: "Navigate", action: () => navigate("/documents", "Documents") },
    { id: "safety", label: "Safety", icon: Shield, group: "Navigate", action: () => navigate("/safety", "Safety") },
    { id: "contracts", label: "Contracts", icon: FileSignature, group: "Navigate", action: () => navigate("/contracts", "Contracts") },
    { id: "procurement", label: "Procurement", icon: ShoppingCart, group: "Navigate", action: () => navigate("/procurement", "Procurement") },
    { id: "compliance", label: "Compliance", icon: ClipboardCheck, group: "Navigate", action: () => navigate("/compliance", "Compliance") },
    { id: "bim", label: "BIM & CAD", icon: Boxes, group: "Navigate", action: () => navigate("/bim", "BIM") },
    { id: "digital-twin", label: "Digital Twin", icon: Globe, group: "Navigate", action: () => navigate("/digital-twin", "Digital Twin") },
    { id: "construction", label: "Construction", icon: Hammer, group: "Navigate", action: () => navigate("/construction", "Construction") },
    { id: "equipment", label: "Equipment", icon: Wrench, group: "Navigate", action: () => navigate("/equipment", "Equipment") },
    { id: "green", label: "Green Monitor", icon: Leaf, group: "Navigate", action: () => navigate("/green", "Green") },
    { id: "vendors", label: "Vendor Scoring", icon: Star, group: "Navigate", action: () => navigate("/vendors", "Vendors") },
    { id: "evm", label: "EVM", icon: LineChart, group: "Navigate", action: () => navigate("/evm", "EVM") },
    { id: "payments", label: "Payment Tracker", icon: CreditCard, group: "Navigate", action: () => navigate("/payments", "Payments") },
    { id: "reports", label: "Reports", icon: BarChart3, group: "Navigate", action: () => navigate("/reports", "Reports") },
    { id: "analytics", label: "Analytics", icon: TrendingUp, group: "Navigate", action: () => navigate("/analytics", "Analytics") },
    { id: "predictive", label: "Predictive AI", icon: Zap, group: "Navigate", action: () => navigate("/predictive", "Predictive AI") },
    { id: "anomaly", label: "Anomaly Detection", icon: AlertTriangle, group: "Navigate", action: () => navigate("/anomaly", "Anomaly") },
    { id: "writing", label: "Writing Assistant", icon: PenTool, group: "Navigate", action: () => navigate("/writing", "Writing") },
    { id: "mlops", label: "MLOps", icon: Cpu, group: "Navigate", action: () => navigate("/mlops", "MLOps") },
    { id: "gnn", label: "GNN Risk", icon: GitBranch, group: "Navigate", action: () => navigate("/gnn", "GNN") },
    { id: "weather", label: "Weather", icon: CloudSun, group: "Navigate", action: () => navigate("/weather", "Weather") },
    { id: "copilot", label: "AI Copilot", icon: Bot, group: "Navigate", action: () => navigate("/copilot", "Copilot") },
    { id: "settings", label: "Settings", icon: Settings, group: "Navigate", action: () => navigate("/settings", "Settings") },
    { id: "rfis", label: "RFI Tracker", icon: MessageSquare, group: "Navigate", keywords: "request for information", action: () => navigate("/rfis", "RFIs") },
    { id: "meetings", label: "Meeting Minutes", icon: FileSpreadsheet, group: "Navigate", action: () => navigate("/meetings", "Meetings") },
    { id: "daily-reports", label: "Daily Site Reports", icon: FileText, group: "Navigate", action: () => navigate("/daily-reports", "Daily Reports") },
    { id: "scenario", label: "Scenario Planner", icon: TrendingUp, group: "Navigate", action: () => navigate("/scenario", "Scenario") },
    { id: "team", label: "Team Management", icon: UserPlus, group: "Navigate", action: () => navigate("/team", "Team") },
    { id: "qr", label: "QR Code Tracker", icon: QrCode, group: "Navigate", action: () => navigate("/qr-tracker", "QR Tracker") },
    { id: "voice", label: "Voice Field Report", icon: Mic, group: "Actions", keywords: "speak record audio", action: () => navigate("/daily-reports", "Daily Reports") },
    { id: "transcribe", label: "AI Transcription", icon: Mic, group: "Navigate", keywords: "whisper audio minutes", action: () => navigate("/transcribe", "Transcription") },
    { id: "scheduled-reports", label: "Scheduled Reports", icon: Mail, group: "Navigate", keywords: "email report schedule", action: () => navigate("/scheduled-reports", "Scheduled Reports") },
    { id: "resource-leveling", label: "Resource Leveling", icon: Users, group: "Navigate", keywords: "worker allocation optimize", action: () => navigate("/resource-leveling", "Resource Leveling") },
    { id: "doc-rag", label: "Search All Documents", icon: FileText, group: "Actions", keywords: "rag natural language search query docs", action: () => navigate("/documents", "Documents") },
  ];

  const filtered = query.trim()
    ? ITEMS.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          item.keywords?.toLowerCase().includes(q)
        );
      })
    : ITEMS.filter((i) => i.group === "Navigate").slice(0, 8);

  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    acc[item.group] = [...(acc[item.group] ?? []), item];
    return acc;
  }, {});

  const flat = Object.values(groups).flat();

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, flat.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flat[selected]) { flat[selected].action(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, flat, selected]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selected}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 top-[12vh] w-full sm:w-[580px] bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules, actions…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border">
                esc
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
              {!query && recent.length > 0 && (
                <div className="mb-2">
                  <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent</p>
                  {recent.map((entry, i) => (
                    <button
                      key={entry.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/60 text-left"
                      onClick={() => {
                        const path = `/${entry.module.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")}`;
                        router.push(path);
                        onClose();
                      }}
                    >
                      <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center shrink-0">
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-sm text-muted-foreground">{entry.action}</span>
                    </button>
                  ))}
                </div>
              )}

              {Object.entries(groups).map(([group, items]) => (
                <div key={group} className="mb-2">
                  <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</p>
                  {items.map((item) => {
                    const idx = flat.indexOf(item);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        onClick={item.action}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          selected === idx ? "bg-blue-500/10 text-blue-400" : "hover:bg-secondary/60 text-foreground"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          selected === idx ? "bg-blue-500/20" : "bg-secondary"
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                        </div>
                        {selected === idx && <ArrowRight className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  No results for "{query}"
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center gap-4 text-xs text-muted-foreground">
              <span><kbd className="bg-border px-1 rounded font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="bg-border px-1 rounded font-mono">↵</kbd> open</span>
              <span><kbd className="bg-border px-1 rounded font-mono">esc</kbd> close</span>
              <span className="ml-auto"><kbd className="bg-border px-1 rounded font-mono">Ctrl K</kbd> toggle</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
