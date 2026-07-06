import { create } from "zustand";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface Tender {
  id: string;
  project_name: string;
  status: "active" | "submitted" | "won" | "lost" | "no-bid";
  summary: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  gap_result: Record<string, unknown> | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
}

interface TenderStore {
  tenders: Tender[];
  loading: boolean;
  fetch: (userId: string) => Promise<void>;
  save: (userId: string, data: Omit<Tender, "id" | "created_at" | "updated_at">) => Promise<Tender | null>;
  update: (id: string, data: Partial<Tender>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTenderStore = create<TenderStore>()((set, get) => ({
  tenders: [],
  loading: false,

  fetch: async (userId) => {
    set({ loading: true });
    try {
      const res = await axios.get(`${API}/api/v1/tenders`, { params: { user_id: userId } });
      set({ tenders: (res.data.tenders ?? []) as Tender[] });
    } catch (e) {
      console.error("[tenderStore] fetch error:", e);
    } finally {
      set({ loading: false });
    }
  },

  save: async (userId, data) => {
    try {
      const res = await axios.post(`${API}/api/v1/tenders`, { user_id: userId, ...data });
      const row = res.data.tender as Tender | null;
      if (row) {
        set((s) => ({ tenders: [row, ...s.tenders] }));
        return row;
      }
      return null;
    } catch (e) {
      console.error("[tenderStore] save error:", e);
      return null;
    }
  },

  update: async (id, data) => {
    try {
      await axios.patch(`${API}/api/v1/tenders/${id}`, data);
      set((s) => ({
        tenders: s.tenders.map((t) => t.id === id ? { ...t, ...data } : t),
      }));
    } catch (e) {
      console.error("[tenderStore] update error:", e);
    }
  },

  remove: async (id) => {
    try {
      await axios.delete(`${API}/api/v1/tenders/${id}`);
      set((s) => ({ tenders: s.tenders.filter((t) => t.id !== id) }));
    } catch (e) {
      console.error("[tenderStore] remove error:", e);
    }
  },
}));
