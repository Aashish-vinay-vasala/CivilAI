"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { installAxiosAuthInterceptor } from "@/lib/axiosAuthInterceptor";
import { useRoleStore, type UserRole } from "@/lib/stores/roleStore";

// Quick-fill demo credentials shown on the login page — these are real
// Supabase Auth accounts, seeded via backend/scripts/seed_demo_users.py,
// with matching `profiles.role` rows so backend RBAC applies correctly.
export const DUMMY_ACCOUNTS = [
  {
    id: "a1b2c3d4-0001-0000-0000-000000000001",
    name: "Sarah Chen",
    role: "Project Director",
    email: "director@civilai.com",
    password: "Director@2024",
    avatar: "SC",
    color: "bg-blue-500",
  },
  {
    id: "a1b2c3d4-0001-0000-0000-000000000002",
    name: "James Wilson",
    role: "Project Admin",
    email: "admin@civilai.com",
    password: "Admin@2024",
    avatar: "JW",
    color: "bg-cyan-500",
  },
  {
    id: "a1b2c3d4-0001-0000-0000-000000000003",
    name: "Mike Torres",
    role: "Contractor",
    email: "contractor@civilai.com",
    password: "Contractor@2024",
    avatar: "MT",
    color: "bg-orange-500",
  },
  {
    id: "a1b2c3d4-0001-0000-0000-000000000004",
    name: "Priya Patel",
    role: "Site Engineer",
    email: "engineer@civilai.com",
    password: "Engineer@2024",
    avatar: "PP",
    color: "bg-emerald-500",
  },
];

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
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

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
    installAxiosAuthInterceptor();

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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? { message: error.message } : null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error ? { message: error.message } : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
