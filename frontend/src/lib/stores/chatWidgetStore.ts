import { create } from "zustand";

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

function newSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type Updater<T> = T | ((prev: T) => T);

function resolveUpdate<T>(update: Updater<T>, prev: T): T {
  return typeof update === "function" ? (update as (p: T) => T)(prev) : update;
}

interface ChatWidgetStore {
  open: boolean;
  setOpen: (v: Updater<boolean>) => void;

  messages: ChatMessage[];
  setMessages: (v: Updater<ChatMessage[]>) => void;

  sessionId: string;
  sessionLabel: string;

  webSearch: boolean;
  setWebSearch: (v: Updater<boolean>) => void;

  /** Clears the current conversation and starts a fresh session id (used by "New Chat"). */
  startNewSession: () => void;

  /** Loads a previously saved session (from the History list) into the active widget. */
  loadSession: (id: string, messages: ChatMessage[], label: string) => void;
}

// Single shared instance — this is what makes the floating widget's conversation
// survive client-side page navigation even though every page mounts its own
// <ModuleChat /> element. The store, not the component, is the source of truth.
export const useChatWidgetStore = create<ChatWidgetStore>()((set) => ({
  open: false,
  setOpen: (v) => set((s) => ({ open: resolveUpdate(v, s.open) })),

  messages: [],
  setMessages: (v) => set((s) => ({ messages: resolveUpdate(v, s.messages) })),

  sessionId: newSessionId(),
  sessionLabel: "",

  webSearch: false,
  setWebSearch: (v) => set((s) => ({ webSearch: resolveUpdate(v, s.webSearch) })),

  startNewSession: () => set({ messages: [], sessionId: newSessionId(), sessionLabel: "" }),
  loadSession: (id, messages, label) => set({ sessionId: id, messages, sessionLabel: label }),
}));
