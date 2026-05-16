import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type NotificationType = "info" | "warning" | "success" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  module?: string;
}

interface DbRow {
  id: string;
  type: string;
  title: string;
  message: string;
  module: string | null;
  read: boolean;
  created_at: string;
}

function rowToNotification(row: DbRow): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    module: row.module ?? undefined,
    read: row.read,
    timestamp: new Date(row.created_at),
  };
}

interface NotificationStore {
  notifications: Notification[];
  userId: string | null;
  setUserId: (id: string) => void;
  setNotifications: (ns: Notification[]) => void;

  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  fetchFromSupabase: () => Promise<void>;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],
  userId: null,

  setUserId: (id) => set({ userId: id }),
  setNotifications: (ns) => set({ notifications: ns }),

  fetchFromSupabase: async () => {
    const userId = get().userId;
    if (!userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      set({ notifications: (data as DbRow[]).map(rowToNotification) });
    }
  },

  addNotification: async (n) => {
    const userId = get().userId;
    if (!userId) return;
    // Insert — real-time subscription will push it into local state automatically
    await supabase.from("notifications").insert({
      user_id: userId,
      type: n.type,
      title: n.title,
      message: n.message,
      module: n.module ?? null,
      read: false,
    });
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    }));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  },

  markAllRead: async () => {
    const userId = get().userId;
    if (!userId) return;
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  },

  remove: async (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    await supabase.from("notifications").delete().eq("id", id);
  },

  clearAll: async () => {
    const userId = get().userId;
    if (!userId) return;
    set({ notifications: [] });
    await supabase.from("notifications").delete().eq("user_id", userId);
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
