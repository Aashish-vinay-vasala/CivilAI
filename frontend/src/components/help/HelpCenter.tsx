"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, X, Search, ChevronRight, BookOpen,
  DollarSign, Calendar, Shield, FileText, Cpu,
  BarChart3, AlertTriangle, Bot
} from "lucide-react";

interface Article {
  title: string;
  content: string;
}

interface HelpSection {
  icon: React.ElementType;
  title: string;
  color: string;
  articles: Article[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    icon: BookOpen,
    title: "Getting Started",
    color: "text-blue-400 bg-blue-500/10",
    articles: [
      {
        title: "Welcome to CivilAI",
        content: "CivilAI is an AI-powered construction management platform. Use the sidebar to navigate between 26 modules covering cost, scheduling, safety, BIM, and more.",
      },
      {
        title: "Setting up your project",
        content: "Go to the Dashboard to see your project KPIs. Connect your data sources in Settings → Integrations to enable real-time AI insights.",
      },
      {
        title: "Understanding roles & permissions",
        content: "CivilAI supports 4 roles: Admin (full access), Project Manager (edit + financials), Engineer (edit, no financials), and Viewer (read-only).",
      },
    ],
  },
  {
    icon: DollarSign,
    title: "Cost & Budget",
    color: "text-orange-400 bg-orange-500/10",
    articles: [
      {
        title: "How cost forecasting works",
        content: "CivilAI uses historical cost data and ML models to forecast future spend. The AI considers material prices, labor rates, and scope changes.",
      },
      {
        title: "Setting budget thresholds",
        content: "Navigate to Cost & Budget → Thresholds to configure alert percentages. You'll be notified in the Notifications Center when thresholds are reached.",
      },
    ],
  },
  {
    icon: Calendar,
    title: "Scheduling",
    color: "text-cyan-400 bg-cyan-500/10",
    articles: [
      {
        title: "Reading the Gantt chart",
        content: "Drag tasks to reschedule. Red tasks are on the critical path. AI delay predictions appear as dashed lines showing projected finish dates.",
      },
      {
        title: "Delay prediction model",
        content: "The scheduling AI factors in weather forecasts, crew availability, material delivery dates, and historical task durations to predict delays.",
      },
    ],
  },
  {
    icon: Shield,
    title: "Safety",
    color: "text-red-400 bg-red-500/10",
    articles: [
      {
        title: "Safety risk scoring",
        content: "Each site receives a risk score (0–100) based on incident history, weather, crew fatigue indicators, and compliance records.",
      },
    ],
  },
  {
    icon: FileText,
    title: "Documents & OCR",
    color: "text-teal-400 bg-teal-500/10",
    articles: [
      {
        title: "Uploading documents",
        content: "Drag and drop PDFs, images, or Word docs. The VLM engine will extract text, tables, and key data points automatically within seconds.",
      },
    ],
  },
  {
    icon: AlertTriangle,
    title: "Anomaly Detection",
    color: "text-yellow-400 bg-yellow-500/10",
    articles: [
      {
        title: "Understanding anomaly scores",
        content: "Scores above 70 are high-risk anomalies. The ML model detects unusual patterns in cost, schedule, and safety data across your projects.",
      },
    ],
  },
  {
    icon: Bot,
    title: "AI Copilot",
    color: "text-emerald-400 bg-emerald-500/10",
    articles: [
      {
        title: "Using the AI Copilot",
        content: "The chat widget on every page is context-aware — it knows which module you're in. Ask questions like 'Why is the cost forecast high?' or 'Summarize today's safety data.'",
      },
    ],
  },
  {
    icon: Cpu,
    title: "MLOps & Models",
    color: "text-indigo-400 bg-indigo-500/10",
    articles: [
      {
        title: "Retraining models",
        content: "Go to MLOps to view model performance metrics and trigger retraining runs. Model versions are tracked with accuracy, F1, and drift scores.",
      },
    ],
  },
];

interface HelpCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpCenter({ open, onClose }: HelpCenterProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);

  const filtered = HELP_SECTIONS.map((section) => ({
    ...section,
    articles: section.articles.filter(
      (a) =>
        !search ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.content.toLowerCase().includes(search.toLowerCase()) ||
        section.title.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((s) => s.articles.length > 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-foreground">Help Center</span>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setArticle(null); }}
                  placeholder="Search documentation..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {article ? (
                <div className="p-5">
                  <button
                    onClick={() => setArticle(null)}
                    className="text-xs text-blue-400 hover:underline mb-4 flex items-center gap-1"
                  >
                    ← Back
                  </button>
                  <h3 className="font-semibold text-foreground mb-3">{article.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{article.content}</p>
                </div>
              ) : (
                <div className="p-5 space-y-3">
                  {filtered.map((section) => {
                    const Icon = section.icon;
                    const isOpen = expanded === section.title || !!search;
                    return (
                      <div key={section.title} className="border border-border rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpanded(isOpen && !search ? null : section.title)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${section.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-sm font-medium text-foreground flex-1 text-left">{section.title}</span>
                          <span className="text-xs text-muted-foreground mr-1">{section.articles.length}</span>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                        {isOpen && (
                          <div className="border-t border-border divide-y divide-border">
                            {section.articles.map((a) => (
                              <button
                                key={a.title}
                                onClick={() => setArticle(a)}
                                className="w-full text-left px-4 py-2.5 hover:bg-secondary/50 transition-colors"
                              >
                                <p className="text-sm text-muted-foreground hover:text-foreground">{a.title}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      No results for "{search}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border flex-shrink-0 bg-secondary/30">
              <p className="text-xs text-muted-foreground text-center">
                Press <kbd className="px-1 py-0.5 text-xs bg-border rounded font-mono">Ctrl+H</kbd> to open Help Center anytime
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
