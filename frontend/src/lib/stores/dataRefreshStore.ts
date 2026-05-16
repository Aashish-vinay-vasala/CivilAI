import { create } from "zustand";

export type DataType =
  | "workers"
  | "documents"
  | "safety"
  | "cost"
  | "schedule"
  | "equipment"
  | "vendors"
  | "contracts"
  | "compliance"
  | "projects";

interface DataRefreshStore {
  counters: Record<DataType, number>;
  triggerRefresh: (type: DataType) => void;
  triggerMany: (types: DataType[]) => void;
}

export const useDataRefreshStore = create<DataRefreshStore>()((set) => ({
  counters: {
    workers: 0,
    documents: 0,
    safety: 0,
    cost: 0,
    schedule: 0,
    equipment: 0,
    vendors: 0,
    contracts: 0,
    compliance: 0,
    projects: 0,
  },
  triggerRefresh: (type) =>
    set((s) => ({ counters: { ...s.counters, [type]: s.counters[type] + 1 } })),
  triggerMany: (types) =>
    set((s) => {
      const next = { ...s.counters };
      types.forEach((t) => { next[t] = next[t] + 1; });
      return { counters: next };
    }),
}));
