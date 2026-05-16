import { create } from "zustand";

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  total_budget?: number;
  spent_to_date?: number;
  progress_percentage?: number;
}

interface ProjectStore {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  setProjects: (projects: ProjectSummary[]) => void;
  setCurrentProjectId: (id: string | null) => void;
  currentProject: () => ProjectSummary | null;
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  projects: [],
  currentProjectId: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  currentProject: () => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return projects[0] ?? null;
    return projects.find((p) => p.id === currentProjectId) ?? null;
  },
}));
