"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import { useActivityStore } from "@/lib/stores/activityStore";
import { useDataRefreshStore, type DataType } from "@/lib/stores/dataRefreshStore";

const PATH_TO_MODULE: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/cost":         "Cost & Budget",
  "/scheduling":   "Scheduling",
  "/workforce":    "Workforce",
  "/documents":    "Documents",
  "/safety":       "Safety",
  "/contracts":    "Contracts",
  "/procurement":  "Procurement",
  "/compliance":   "Compliance",
  "/bim":          "BIM & CAD",
  "/digital-twin": "Digital Twin",
  "/construction": "Construction",
  "/equipment":    "Equipment",
  "/green":        "Green Monitor",
  "/vendors":      "Vendor Scoring",
  "/evm":          "EVM",
  "/payments":     "Payment Tracker",
  "/reports":      "Reports",
  "/analytics":    "Analytics",
  "/predictive":   "Predictive AI",
  "/anomaly":      "Anomaly Detection",
  "/writing":      "Writing Assistant",
  "/mlops":        "MLOps",
  "/gnn":          "GNN Risk",
  "/weather":      "Weather",
  "/copilot":      "AI Copilot",
  "/settings":     "Settings",
};

export function useSupabaseSync(userId: string | null, displayName: string) {
  const notifStore  = useNotificationStore();
  const actStore    = useActivityStore();
  const pathname    = usePathname();
  const prevPath    = useRef<string | null>(null);
  const initialized = useRef(false);

  // ── 1. Set user ids in both stores once we have them ──────────────────────
  useEffect(() => {
    if (!userId) return;
    notifStore.setUserId(userId);
    actStore.setUser(userId, displayName);
  }, [userId, displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Initial data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || initialized.current) return;
    initialized.current = true;
    try { notifStore.fetchFromSupabase(); } catch {}
    try { actStore.fetchFromSupabase(); } catch {}
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Real-time notification subscription ────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              const row = payload.new as {
                id: string; type: string; title: string;
                message: string; module: string | null;
                read: boolean; created_at: string;
              };
              notifStore.setNotifications([
                {
                  id:        row.id,
                  type:      row.type as "info" | "warning" | "success" | "error",
                  title:     row.title,
                  message:   row.message,
                  module:    row.module ?? undefined,
                  read:      row.read,
                  timestamp: new Date(row.created_at),
                },
                ...useNotificationStore.getState().notifications,
              ]);
            } catch {}
          }
        )
        .subscribe();
    } catch {}

    return () => { try { if (channel) supabase.removeChannel(channel); } catch {} };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Cross-tab/cross-user data sync ──────────────────────────────────────
  // These tables are shared team data (not scoped to this user), so any
  // insert/update/delete anywhere should invalidate the same useDataRefreshStore
  // counters every page already listens to — without this, a change made in one
  // browser tab (or by a teammate) never reaches an already-open EVM/Cost/Overview
  // tab until it's manually reloaded. schedule_tasks/workforce/safety_incidents/
  // projects must also be added to the `supabase_realtime` publication (see
  // migration 030) or no postgres_changes event is ever emitted for them.
  useEffect(() => {
    if (!userId) return;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    const watch = (table: string, dataType: DataType) => {
      try {
        const ch = supabase
          .channel(`sync:${table}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            () => { useDataRefreshStore.getState().triggerRefresh(dataType); }
          )
          .subscribe();
        channels.push(ch);
      } catch {}
    };
    watch("cost_entries", "cost");
    watch("invoices", "payments");
    watch("schedule_tasks", "schedule");
    watch("workforce", "workers");
    watch("safety_incidents", "safety");
    watch("projects", "projects");

    return () => { channels.forEach((ch) => { try { supabase.removeChannel(ch); } catch {} }); };
  }, [userId]);

  // ── 5. Log navigation on every route change ───────────────────────────────
  useEffect(() => {
    if (!userId) return;
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    const module = PATH_TO_MODULE[pathname] ?? "App";
    actStore.log(`Navigated to ${module}`, module);
  }, [pathname, userId]); // eslint-disable-line react-hooks/exhaustive-deps
}
