"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import axios from "axios";
import { supabase } from "@/lib/supabase";
import { installAxiosAuthInterceptor } from "@/lib/axiosAuthInterceptor";
import { useRoleStore } from "@/lib/stores/roleStore";

const API = process.env.NEXT_PUBLIC_API_URL;

export type DemoRole = "admin" | "project_manager" | "site_engineer" | "viewer" | "procurement_manager";

export interface Profile {
  full_name: string;
  role: string;
  avatar_color: string;
  account_type: "demo" | "real";
  otp_verified: boolean;
}

interface AuthError {
  message: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  demoLogin: (role: DemoRole) => Promise<{ error: AuthError | null }>;
  signUpWithPassword: (email: string, password: string, fullName: string, role: DemoRole) => Promise<{ error: AuthError | null; needsEmailConfirmation?: boolean }>;
  signUpWithGoogle: (role: DemoRole) => Promise<{ error: AuthError | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  verifyPasswordResetOtp: (email: string, token: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (email: string, newPassword: string) => Promise<{ error: AuthError | null }>;
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
  const setPermissions = useRoleStore((s) => s.setPermissions);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name,role,avatar_color,account_type,otp_verified")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data as Profile);
      setRole(data.role);
    }
    try {
      const res = await axios.get(`${API}/api/v1/auth/permissions`);
      setPermissions(res.data.modules ?? {});
    } catch {
      // AUTH_REQUIRED off, or the request raced session setup — roleStore
      // keeps whatever permissions it already had (or the empty default).
    }
  }, [setRole, setPermissions]);

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

  const demoLogin = async (role: DemoRole) => {
    try {
      const res = await axios.post(`${API}/api/v1/auth/demo-login`, { role });
      const { error } = await supabase.auth.setSession({
        access_token: res.data.access_token,
        refresh_token: res.data.refresh_token,
      });
      return { error: error ? { message: error.message } : null };
    } catch (e) {
      const message = axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : "Demo login failed";
      return { error: { message } };
    }
  };

  const signUpWithPassword = async (email: string, password: string, fullName: string, role: DemoRole) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    if (error) return { error: { message: error.message } };

    if (!data.session) {
      // Project requires confirming the email first — no session yet. Stash
      // the role so /auth/callback can finish setup once they click the link.
      if (typeof window !== "undefined") {
        sessionStorage.setItem("civilai_signup_role", role);
      }
      return { error: null, needsEmailConfirmation: true };
    }

    try {
      await axios.post(`${API}/api/v1/auth/complete-signup`, { role });
    } catch (e) {
      const message = axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : "Could not set role";
      return { error: { message } };
    }
    return { error: null };
  };

  const signUpWithGoogle = async (role: DemoRole) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("civilai_signup_role", role);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? { message: error.message } : null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? { message: error.message } : null };
  };

  // Deliberately doesn't stash a role in sessionStorage — that's the signal
  // /auth/callback uses to tell a fresh signup from a returning-user login,
  // so it knows whether to (re)assign a role via complete-signup.
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? { message: error.message } : null };
  };

  // Sends a 6-digit recovery code (type "recovery" on the Reset Password
  // email template) rather than a clickable link, matching the OTP pattern
  // already used for Google signup verification.
  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
    });
    return { error: error ? { message: error.message } : null };
  };

  const verifyPasswordResetOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    return { error: error ? { message: error.message } : null };
  };

  // Rejects reusing the current password before changing it: attempting to
  // sign in with the proposed new password only succeeds if it's identical
  // to what's already stored, since Supabase never exposes the old hash for
  // a direct comparison. A failure here is the expected/desired outcome.
  const updatePassword = async (email: string, newPassword: string) => {
    const { error: sameAsOldError } = await supabase.auth.signInWithPassword({ email, password: newPassword });
    if (!sameAsOldError) {
      return { error: { message: "New password must be different from your current password." } };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
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
        demoLogin,
        signUpWithPassword,
        signUpWithGoogle,
        signInWithPassword,
        signInWithGoogle,
        requestPasswordReset,
        verifyPasswordResetOtp,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
