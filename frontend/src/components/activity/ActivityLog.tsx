"use client";

import { motion } from "framer-motion";
import { Activity, Trash2, Clock } from "lucide-react";
import { useActivityStore } from "@/lib/stores/activityStore";
import { Button } from "@/components/ui/button";

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const MODULE_COLORS: Record<string, string> = {
  Dashboard: "bg-blue-500/10 text-blue-400",
  "Cost & Budget": "bg-orange-500/10 text-orange-400",
  Safety: "bg-red-500/10 text-red-400",
  Documents: "bg-purple-500/10 text-purple-400",
  Reports: "bg-emerald-500/10 text-emerald-400",
  Scheduling: "bg-cyan-500/10 text-cyan-400",
  Workforce: "bg-yellow-500/10 text-yellow-400",
};

function moduleColor(module: string) {
  return MODULE_COLORS[module] ?? "bg-gray-500/10 text-gray-400";
}

export default function ActivityLog() {
  const { entries, clear } = useActivityStore();

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-foreground">Activity Log</h2>
        </div>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clear}>
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm">
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
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
              className="flex items-start gap-3 p-3 bg-secondary/30 rounded-xl"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground">{entry.action}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${moduleColor(entry.module)}`}>
                    {entry.module}
                  </span>
                </div>
                {entry.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.detail}</p>
                )}
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/60">
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
