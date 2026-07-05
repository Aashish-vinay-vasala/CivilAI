"use client";

import { createContext, useContext, useEffect, useState } from "react";

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

interface DummyUser {
  id: string;
  email: string;
  user_metadata: { full_name: string; role: string };
}

interface AuthContextType {
  user: DummyUser | null;
  session: { user: DummyUser } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const STORAGE_KEY = "civilai_dummy_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DummyUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const account = DUMMY_ACCOUNTS.find(
      (a) => a.email === email && a.password === password
    );
    if (!account) return { error: { message: "Invalid email or password" } };
    const u: DummyUser = {
      id: account.id,
      email: account.email,
      user_metadata: { full_name: account.name, role: account.role },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return { error: null };
  };

  const signUp = async (email: string, password: string, _name: string) => {
    return signIn(email, password);
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const signInWithGoogle = async () => {
    // Auto-login as director for demo
    await signIn("director@civilai.com", "Director@2024");
  };

  const session = user ? { user } : null;

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
