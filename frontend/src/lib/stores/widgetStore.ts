import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WidgetId = "kpi-budget" | "kpi-schedule" | "kpi-workers" | "kpi-safety" | "chart-progress" | "chart-cost" | "alerts" | "modules" | "projects";

export interface Widget {
  id: WidgetId;
  title: string;
  visible: boolean;
  size: "sm" | "md" | "lg" | "full";
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: "kpi-budget",    title: "Total Budget",       visible: true, size: "sm" },
  { id: "kpi-schedule",  title: "Schedule Progress",  visible: true, size: "sm" },
  { id: "kpi-workers",   title: "Active Workers",     visible: true, size: "sm" },
  { id: "kpi-safety",    title: "Safety Score",       visible: true, size: "sm" },
  { id: "chart-progress",title: "Progress Chart",     visible: true, size: "md" },
  { id: "chart-cost",    title: "Cost Chart",         visible: true, size: "md" },
  { id: "alerts",        title: "Alerts",             visible: true, size: "md" },
  { id: "modules",       title: "Quick Access",       visible: true, size: "md" },
  { id: "projects",      title: "Projects",           visible: true, size: "full" },
];

interface WidgetStore {
  widgets: Widget[];
  reorder: (from: number, to: number) => void;
  toggleVisibility: (id: WidgetId) => void;
  reset: () => void;
}

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set) => ({
      widgets: DEFAULT_WIDGETS,
      reorder: (from, to) =>
        set((s) => {
          const list = [...s.widgets];
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          return { widgets: list };
        }),
      toggleVisibility: (id) =>
        set((s) => ({
          widgets: s.widgets.map((w) => w.id === id ? { ...w, visible: !w.visible } : w),
        })),
      reset: () => set({ widgets: DEFAULT_WIDGETS }),
    }),
    { name: "civilai-widgets" }
  )
);
