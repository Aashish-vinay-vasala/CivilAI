"use client";

import { motion } from "framer-motion";
import { Search, Moon, Sun, Menu, HelpCircle, Keyboard } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import NotificationCenter from "@/components/notifications/NotificationCenter";

interface NavbarProps {
  onMenuClick: () => void;
  onToggleHelp: () => void;
  onToggleShortcuts: () => void;
}

export default function Navbar({ onMenuClick, onToggleHelp, onToggleShortcuts }: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-16 border-b border-border bg-background/80 backdrop-blur-sm flex items-center px-4 gap-3 sticky top-0 z-30"
    >
      {/* Mobile hamburger */}
      <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </Button>

      {/* Search */}
      <div className="flex-1 max-w-md" id="search-bar">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects, documents… (Ctrl+K)"
            className="w-full pl-9 pr-4 py-2 text-sm bg-secondary rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Keyboard shortcuts */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleShortcuts}
          aria-label="Keyboard shortcuts"
          className="hidden sm:flex"
          id="shortcuts-btn"
        >
          <Keyboard className="w-4 h-4" />
        </Button>

        {/* Help center */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleHelp}
          aria-label="Help center"
          id="help-btn"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>

        {/* Notifications */}
        <NotificationCenter />

        {/* Theme toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            id="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </motion.header>
  );
}
