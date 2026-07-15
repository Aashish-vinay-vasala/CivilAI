"use client";

import { motion } from "framer-motion";
import { Activity, Trash2, Clock } from "lucide-react";
import { useActivityStore } from "@/lib/stores/activityStore";

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Mirrors the per-module accent used on the main dashboard's Quick Access cards.
const MODULE_COLORS: Record<string, string> = {
  Dashboard: "bg-cyan-500/10 text-cyan-400",
  "Cost & Budget": "bg-cyan-500/10 text-cyan-400",
  Scheduling: "bg-amber-500/10 text-amber-400",
  Safety: "bg-red-500/10 text-red-400",
  Workforce: "bg-emerald-500/10 text-emerald-400",
  Documents: "bg-teal-500/10 text-teal-400",
  Reports: "bg-purple-500/10 text-purple-400",
};

function moduleColor(module: string) {
  return MODULE_COLORS[module] ?? "bg-white/5 text-white/30";
}

export default function ActivityLog() {
  const { entries, clear } = useActivityStore();

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="font-semibold text-white">Activity Log</h2>
        </div>
        {entries.length > 0 && (
          <button
            onClick={clear}
            className="h-7 px-2.5 flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-10 text-center text-white/30 text-sm">
          <Activity className="w-8 h-8 mx-auto mb-3 text-white/15" />
          No activity yet
        </div>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white">{entry.action}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${moduleColor(entry.module)}`}>
                    {entry.module}
                  </span>
                </div>
                {entry.detail && (
                  <p className="text-xs text-white/35 mt-0.5 truncate">{entry.detail}</p>
                )}
                <div className="flex items-center gap-1 mt-1 text-xs text-white/25">
                  <Clock className="w-3 h-3" />
                  {formatTime(entry.timestamp)}
                  {entry.user && <span className="ml-1">· {entry.user}</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
