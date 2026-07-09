"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { installAxiosAuthInterceptor } from "@/lib/axiosAuthInterceptor";
import { useRoleStore, type UserRole } from "@/lib/stores/roleStore";

// Single seeded Supabase account (admin role) that "Start Demo" signs into —
// no signup/login form, no other accounts. Real JWT, real backend RBAC, just
// no user-facing credential entry.
const DEMO_EMAIL = "aashishvinayvasala@gmail.com";
const DEMO_PASSWORD = "civilaidemo";

// Maps the backend's real RBAC role vocabulary (profiles.role, checked by
// backend/app/core/guardrails.ROLE_PERMISSIONS) onto the frontend's cosmetic
// permission-tier vocabulary (lib/stores/roleStore.ts) so the two stay in sync.
const BACKEND_ROLE_TO_FRONTEND: Record<string, UserRole> = {
  project_director: "pm",
  admin: "admin",
  engineer: "engineer",
  contractor: "viewer",
};

export interface Profile {
  full_name: string;
  role: string;
  avatar_color: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  startDemo: () => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Installed at module scope (not inside AuthProvider's useEffect) so it's
// registered before any child page's own useEffect fires — React runs child
// effects before parent effects on mount, so an effect-scoped install here
// would lose that race and let each page's first fetch go out unauthenticated.
installAxiosAuthInterceptor();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const setRole = useRoleStore((s) => s.setRole);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name,role,avatar_color")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data as Profile);
      setRole(BACKEND_ROLE_TO_FRONTEND[data.role] ?? "viewer");
    }
  }, [setRole]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const startDemo = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    return { error: error ? { message: error.message } : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        profile,
        session,
        loading,
        startDemo,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
