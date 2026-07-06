"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Clock, ChevronRight, X, FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import { MarkdownText } from "@/lib/renderMarkdown";
import { useDataRefreshStore, type DataType } from "@/lib/stores/dataRefreshStore";

const API = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/review`;

interface ReviewItem {
  id: string;
  route: string;
  trigger_reason: string;
  payload_summary: string;
  ai_output?: string;
  risk_score: number;
  status: "pending" | "approved" | "rejected";
  reviewer_name: string | null;
  reviewed_at: string | null;
  notes?: string | null;
  project_id: string | null;
  created_at: string;
}

const STATUS_TABS = ["pending", "approved", "rejected", "all"] as const;

function riskColor(score: number) {
  if (score >= 7) return { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" };
  if (score >= 4) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" };
  return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function ReviewQueuePage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [filterStatus, setFilterStatus] = useState<typeof STATUS_TABS[number]>("pending");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ pending: number; approved: number; rejected: number } | null>(null);

  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/queue`, { params: { status: filterStatus } });
      setItems(res.data.items || []);
    } catch {
      toast.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/stats`);
      setStats(res.data.stats);
    } catch {
      // silent — badge counts just won't show
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const openItem = async (item: ReviewItem) => {
    setSelected(item);
    setReviewerName("");
    setNotes("");
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/queue/${item.id}`);
      setSelected(res.data);
    } catch {
      toast.error("Failed to load full review item");
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!selected) return;
    if (!reviewerName.trim()) { toast.error("Enter your name to record this decision"); return; }
    if (decision === "reject" && !notes.trim()) { toast.error("A rejection reason is required"); return; }
    setActing(decision);
    try {
      await axios.post(`${API}/queue/${selected.id}/${decision}`, {
        reviewer_name: reviewerName, notes,
      });
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      setSelected(null);
      fetchQueue();
      fetchStats();
      triggerRefresh("review");
      const relatedModule = selected.route as DataType;
      if (["contracts", "vendors", "safety"].includes(relatedModule)) triggerRefresh(relatedModule);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? `Failed to ${decision}`);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Human Review Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">
            High-risk AI outputs flagged for a director or admin to approve or reject
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Pending", value: stats?.pending ?? "—", icon: Clock, color: "border-amber-500/20 bg-amber-500/5", iconColor: "text-amber-400" },
          { label: "Approved", value: stats?.approved ?? "—", icon: CheckCircle2, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Rejected", value: stats?.rejected ?? "—", icon: XCircle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} className={`rounded-2xl border p-5 ${kpi.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Queue list */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex gap-1 mb-4 border-b border-border pb-3">
            {STATUS_TABS.map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filterStatus === s ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-muted-foreground hover:text-foreground"
                }`}>
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No {filterStatus !== "all" ? filterStatus : ""} items</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const rc = riskColor(item.risk_score);
                const isActive = selected?.id === item.id;
                return (
                  <button key={item.id} onClick={() => openItem(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      isActive ? "bg-cyan-500/5 border-cyan-500/25" : "bg-secondary/40 border-transparent hover:bg-secondary/70"
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.trigger_reason}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.route} · {formatTime(item.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${rc.bg} ${rc.text} border ${rc.border}`}>
                        Risk {item.risk_score.toFixed(1)}
                      </span>
                      {item.status !== "pending" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
                          item.status === "approved" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {item.status}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3 bg-card border border-border rounded-2xl p-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
              <FileWarning className="w-10 h-10 mb-2" />
              <p className="text-sm">Select an item to review</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{selected.trigger_reason}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selected.route} · {formatTime(selected.created_at)}
                    {selected.project_id && ` · Project ${selected.project_id}`}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${riskColor(selected.risk_score).bg} ${riskColor(selected.risk_score).text} ${riskColor(selected.risk_score).border}`}>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Risk score {selected.risk_score.toFixed(1)}/10
                </span>
                {selected.status !== "pending" && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                    selected.status === "approved" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {selected.status} {selected.reviewer_name && `by ${selected.reviewer_name}`}
                  </span>
                )}
              </div>

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Summary</p>
              <p className="text-sm text-foreground mb-4">{selected.payload_summary}</p>

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">AI Output</p>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading full output…
                </div>
              ) : (
                <div className="p-4 bg-secondary rounded-xl mb-4 max-h-64 overflow-y-auto">
                  <MarkdownText text={selected.ai_output || "—"} className="text-sm text-muted-foreground leading-relaxed" />
                </div>
              )}

              {selected.status === "pending" ? (
                <div className="border-t border-border pt-4 space-y-3">
                  <input placeholder="Your name *" value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  <textarea placeholder="Notes (required to reject, optional to approve)" value={notes}
                    onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                  <div className="flex gap-3">
                    <Button onClick={() => decide("reject")} disabled={acting !== null}
                      variant="destructive" className="flex-1">
                      {acting === "reject" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                      Reject
                    </Button>
                    <Button onClick={() => decide("approve")} disabled={acting !== null}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                      {acting === "approve" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Approve
                    </Button>
                  </div>
                </div>
              ) : (
                selected.notes && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reviewer Notes</p>
                    <p className="text-sm text-foreground">{selected.notes}</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
