import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PinnedStore {
  pinned: string[];
  pin: (href: string) => void;
  unpin: (href: string) => void;
  isPinned: (href: string) => boolean;
}

export const usePinnedStore = create<PinnedStore>()(
  persist(
    (set, get) => ({
      pinned: ["/dashboard", "/cost", "/safety"],
      pin: (href) => set((s) => ({ pinned: s.pinned.includes(href) ? s.pinned : [...s.pinned, href] })),
      unpin: (href) => set((s) => ({ pinned: s.pinned.filter((h) => h !== href) })),
      isPinned: (href) => get().pinned.includes(href),
    }),
    { name: "civilai-pinned" }
  )
);
