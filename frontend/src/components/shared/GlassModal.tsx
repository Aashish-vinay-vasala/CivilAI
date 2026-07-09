"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export default function GlassModal({ open, onClose, title, subtitle, maxWidth = "max-w-md", children }: {
  open: boolean; onClose: () => void;
  title: string; subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`w-full ${maxWidth} rounded-2xl p-6 max-h-[85vh] overflow-y-auto`}
            style={{
              background: "rgba(4,11,25,0.92)",
              border: "1px solid rgba(0,212,255,0.15)",
              boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)",
              backdropFilter: "blur(32px)",
            }}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="font-semibold text-white text-[15px]">{title}</h3>
                {subtitle && <p className="text-[11px] text-white/35 mt-0.5">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors p-1 -mr-1 -mt-1">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
