import { create } from "zustand";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

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

  // Kept the original method name (fetchFromSupabase) so callers don't need to
  // change — it now goes through the backend rather than querying Supabase directly.
  fetchFromSupabase: async () => {
    const userId = get().userId;
    if (!userId) return;
    try {
      const res = await axios.get(`${API}/api/v1/notifications`, { params: { user_id: userId, limit: 50 } });
      const rows: DbRow[] = res.data.notifications ?? [];
      set({ notifications: rows.map(rowToNotification) });
    } catch { /* silent — notification bell just stays empty */ }
  },

  addNotification: async (n) => {
    const userId = get().userId;
    if (!userId) return;
    // Insert — the Supabase Realtime subscription (useSupabaseSync) will push
    // it into local state automatically.
    try {
      await axios.post(`${API}/api/v1/notifications`, {
        user_id: userId,
        type: n.type,
        title: n.title,
        message: n.message,
        module: n.module ?? null,
      });
    } catch { /* silent */ }
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    }));
    try { await axios.patch(`${API}/api/v1/notifications/${id}/read`); } catch { /* silent */ }
  },

  markAllRead: async () => {
    const userId = get().userId;
    if (!userId) return;
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
    try { await axios.patch(`${API}/api/v1/notifications/read-all`, null, { params: { user_id: userId } }); } catch { /* silent */ }
  },

  remove: async (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    try { await axios.delete(`${API}/api/v1/notifications/${id}`); } catch { /* silent */ }
  },

  clearAll: async () => {
    const userId = get().userId;
    if (!userId) return;
    set({ notifications: [] });
    try { await axios.delete(`${API}/api/v1/notifications`, { params: { user_id: userId } }); } catch { /* silent */ }
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
