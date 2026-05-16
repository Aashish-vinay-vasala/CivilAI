import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export interface ActivityEntry {
  id: string;
  action: string;
  module: string;
  detail?: string;
  timestamp: Date;
  user: string;
}

interface DbRow {
  id: string;
  action: string;
  module: string;
  detail: string | null;
  created_at: string;
}

function rowToEntry(row: DbRow, displayName: string): ActivityEntry {
  return {
    id: row.id,
    action: row.action,
    module: row.module,
    detail: row.detail ?? undefined,
    timestamp: new Date(row.created_at),
    user: displayName,
  };
}

interface ActivityStore {
  entries: ActivityEntry[];
  userId: string | null;
  displayName: string;

  setUser: (userId: string, displayName: string) => void;
  log: (action: string, module: string, detail?: string) => void;
  fetchFromSupabase: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useActivityStore = create<ActivityStore>()((set, get) => ({
  entries: [],
  userId: null,
  displayName: "Admin",

  setUser: (userId, displayName) => set({ userId, displayName }),

  log: (action, module, detail) => {
    const { userId, displayName } = get();

    // Optimistic local update
    const localEntry: ActivityEntry = {
      id: crypto.randomUUID(),
      action,
      module,
      detail,
      timestamp: new Date(),
      user: displayName,
    };
    set((s) => ({ entries: [localEntry, ...s.entries.slice(0, 199)] }));

    // Fire-and-forget Supabase insert
    if (userId) {
      const row: Record<string, unknown> = { user_id: userId, action };
      // module/detail columns require migration 002 — include only if present to avoid schema errors
      try { row.module = module; } catch {}
      if (detail !== undefined) { try { row.detail = detail; } catch {} }
      supabase.from("activity_log").insert(row).then(({ error }) => {
        if (error && !error.message.includes("schema cache")) {
          console.error("[activity] insert error:", error.message);
        }
      });
    }
  },

  fetchFromSupabase: async () => {
    const { userId, displayName } = get();
    if (!userId) return;
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      set({ entries: (data as DbRow[]).map((r) => rowToEntry(r, displayName)) });
    }
  },

  clear: async () => {
    const { userId } = get();
    set({ entries: [] });
    if (userId) {
      await supabase.from("activity_log").delete().eq("user_id", userId);
    }
  },
}));
