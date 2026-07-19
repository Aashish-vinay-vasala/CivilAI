import { create } from "zustand";
import { persist } from "zustand/middleware";

// Same 5 role strings the backend uses (profiles.role,
// backend/app/core/guardrails.ROLE_PERMISSIONS) — no translation layer.
export type UserRole = "admin" | "project_manager" | "site_engineer" | "viewer" | "procurement_manager";
export type PermAction = "read" | "write" | "delete";
export type PermissionsMap = Record<string, PermAction[]>;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  viewer: "Viewer",
  procurement_manager: "Procurement Manager",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-500/10 text-red-400 border-red-500/20",
  project_manager: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  site_engineer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  procurement_manager: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  viewer: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

interface RoleStore {
  role: UserRole;
  permissions: PermissionsMap;
  setRole: (role: UserRole) => void;
  setPermissions: (permissions: PermissionsMap) => void;
  /** module -> allowed? Sourced from GET /api/v1/auth/permissions (auth.tsx's
   * loadProfile), which reads the same backend/app/core/guardrails.ROLE_PERMISSIONS
   * the API enforces — no duplicated matrix on the frontend. */
  can: (module: string, action?: PermAction) => boolean;
}

export const useRoleStore = create<RoleStore>()(
  persist(
    (set, get) => ({
      role: "viewer",
      permissions: {},
      setRole: (role) => set({ role }),
      setPermissions: (permissions) => set({ permissions }),
      can: (module, action = "read") => {
        const actions = get().permissions[module];
        return !!actions && actions.includes(action);
      },
    }),
    { name: "civilai-role" }
  )
);
