import { create } from "zustand";
import { supabase } from "@/lib/supabase";

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
    const { data, error } = await supabase
      .from("tenders")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (!error && data) set({ tenders: data as Tender[] });
    set({ loading: false });
  },

  save: async (userId, data) => {
    const { data: row, error } = await supabase
      .from("tenders")
      .insert({ user_id: userId, ...data })
      .select()
      .single();
    if (!error && row) {
      set((s) => ({ tenders: [row as Tender, ...s.tenders] }));
      return row as Tender;
    }
    console.error("[tenderStore] save error:", error?.message);
    return null;
  },

  update: async (id, data) => {
    const { error } = await supabase.from("tenders").update(data).eq("id", id);
    if (!error) {
      set((s) => ({
        tenders: s.tenders.map((t) => t.id === id ? { ...t, ...data } : t),
      }));
    }
  },

  remove: async (id) => {
    await supabase.from("tenders").delete().eq("id", id);
    set((s) => ({ tenders: s.tenders.filter((t) => t.id !== id) }));
  },
}));
