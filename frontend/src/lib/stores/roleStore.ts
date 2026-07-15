import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "admin" | "pm" | "engineer" | "viewer";

export interface RolePermissions {
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canViewFinancials: boolean;
  canApproveContracts: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canEdit: true,
    canDelete: true,
    canExport: true,
    canManageUsers: true,
    canViewFinancials: true,
    canApproveContracts: true,
  },
  pm: {
    canEdit: true,
    canDelete: false,
    canExport: true,
    canManageUsers: false,
    canViewFinancials: true,
    canApproveContracts: true,
  },
  engineer: {
    canEdit: true,
    canDelete: false,
    canExport: true,
    canManageUsers: false,
    canViewFinancials: false,
    canApproveContracts: false,
  },
  viewer: {
    canEdit: false,
    canDelete: false,
    canExport: false,
    canManageUsers: false,
    canViewFinancials: false,
    canApproveContracts: false,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  pm: "Project Manager",
  engineer: "Engineer",
  viewer: "Viewer",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-500/10 text-red-400 border-red-500/20",
  pm: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  engineer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  viewer: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

// Maps the backend's real RBAC role vocabulary (profiles.role, checked by
// backend/app/core/guardrails.ROLE_PERMISSIONS) onto this frontend permission-tier
// vocabulary so the two stay in sync.
export const BACKEND_ROLE_TO_FRONTEND: Record<string, UserRole> = {
  project_director: "pm",
  admin: "admin",
  engineer: "engineer",
  contractor: "viewer",
};

interface RoleStore {
  role: UserRole;
  setRole: (role: UserRole) => void;
  permissions: () => RolePermissions;
  can: (permission: keyof RolePermissions) => boolean;
}

// Demo mode: every role gets full access. `role` is kept purely for display
// (labels/colors/settings picker) — `can()` always returns true regardless of
// which role is selected, so there's no permission gate on any module.
export const useRoleStore = create<RoleStore>()(
  persist(
    (set) => ({
      role: "admin",
      setRole: (role) => set({ role }),
      permissions: () => ({
        canEdit: true,
        canDelete: true,
        canExport: true,
        canManageUsers: true,
        canViewFinancials: true,
        canApproveContracts: true,
      }),
      can: () => true,
    }),
    { name: "civilai-role" }
  )
);
