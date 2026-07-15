import { create } from "zustand";

// Shared project filter for the Workforce module's "Team" and "Resource
// Leveling" tabs (two separate page components) so picking a project in one
// carries over to the other instead of each tab tracking its own selection.
interface WorkforceFilterStore {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export const useWorkforceFilterStore = create<WorkforceFilterStore>()((set) => ({
  selectedProjectId: "all",
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
