"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";
import HelpCenter from "@/components/help/HelpCenter";
import KeyboardShortcutsModal, { useKeyboardShortcuts } from "@/components/shortcuts/KeyboardShortcuts";
import OnboardingTour, { useOnboardingTour } from "@/components/onboarding/OnboardingTour";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import CommandPalette, { useCommandPalette } from "@/components/command/CommandPalette";
import ErrorBoundary from "@/components/layout/ErrorBoundary";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { showModal: shortcutsOpen, setShowModal: setShortcutsOpen } = useKeyboardShortcuts({
    onToggleSidebar: () => setSidebarCollapsed((v) => !v),
    onToggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    onOpenHelp: () => setHelpOpen((v) => !v),
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>("#search-bar input");
      input?.focus();
    },
  });

  const { active: tourActive, complete: completeTour } = useOnboardingTour();
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "Admin";
  useSupabaseSync(user?.id ?? null, displayName);

  const getStoredUser = () => {
    try { return localStorage.getItem("civilai_dummy_user"); } catch { return null; }
  };

  useEffect(() => {
    if (loading) return;
    if (!user && !getStoredUser()) {
      router.replace("/");
    }
  }, [user, loading, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const spinner = (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl gradient-blue flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">Loading CivilAI...</p>
      </div>
    </div>
  );

  if (loading) return spinner;

  // React state not committed yet but localStorage confirms user is logged in
  if (!user && getStoredUser()) return spinner;

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          onToggleHelp={() => setHelpOpen((v) => !v)}
          onToggleShortcuts={() => setShortcutsOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <OnboardingTour active={tourActive} onComplete={completeTour} />

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
