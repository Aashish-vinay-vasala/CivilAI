import { create } from "zustand";

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatToolStep {
  tool: string;
  input: Record<string, unknown>;
  output: string | null;
  done: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  toolSteps?: ChatToolStep[];
  warnings?: string[];
}

// Shared with the AI Copilot page (frontend/src/app/(dashboard)/copilot/page.tsx),
// which already read/wrote this exact key — reusing it is what makes the widget
// and the Copilot page converge on the same backend session/history, whichever
// mounts first.
const SESSION_STORAGE_KEY = "civilai_copilot_session";

function newSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function loadOrCreateSessionId(): string {
  if (typeof window === "undefined") return newSessionId();
  try {
    const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const fresh = newSessionId();
    window.localStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return newSessionId();
  }
}

function persistSessionId(id: string): void {
  try { window.localStorage.setItem(SESSION_STORAGE_KEY, id); } catch {}
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

  /** Whether this session's history has already been loaded from the server once this page load. */
  hydrated: boolean;
  /** Populates `messages` from server history exactly once — see ModuleChat's mount effect. */
  hydrateFromServer: (messages: ChatMessage[]) => void;

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

  sessionId: loadOrCreateSessionId(),
  sessionLabel: "",

  webSearch: false,
  setWebSearch: (v) => set((s) => ({ webSearch: resolveUpdate(v, s.webSearch) })),

  hydrated: false,
  hydrateFromServer: (messages) => set((s) => (s.hydrated ? s : { hydrated: true, messages })),

  startNewSession: () => {
    const fresh = newSessionId();
    persistSessionId(fresh);
    set({ messages: [], sessionId: fresh, sessionLabel: "", hydrated: true });
  },
  loadSession: (id, messages, label) => {
    persistSessionId(id);
    set({ sessionId: id, messages, sessionLabel: label, hydrated: true });
  },
}));
