// Shared network layer for the AI Copilot backend (backend/app/api/v1/routes/copilot.py
// and voice.py) — used by both the floating ModuleChat widget and the AI Copilot
// page's Chat tab so the two surfaces always speak the exact same wire protocol
// and therefore stay in sync on the same session/history.

import axios from "axios";
import { authHeaders } from "@/lib/apiAuth";
import type { ChatMessage as Message, ChatSource as Source, ChatToolStep as ToolStep } from "@/lib/stores/chatWidgetStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface SavedSession {
  id: string;
  label: string;
  messages: Message[];
  created_at: string;
}

export interface ChatResponse {
  response: string;
  session_id?: string;
  status?: string;
  sources?: Source[];
}

export interface StreamChatResult {
  blocked: boolean;
  text: string;
  sessionId: string;
  sources?: Source[];
  toolSteps?: ToolStep[];
}

interface StreamEvent {
  delta?: string;
  done?: boolean;
  blocked?: boolean;
  response?: string;
  final?: string;
  session_id?: string;
  sources?: Source[];
  tool_steps?: { tool: string; input?: Record<string, unknown>; output?: string }[];
  tool_start?: boolean;
  tool_end?: boolean;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface ToolEvent {
  phase: "start" | "end";
  tool: string;
  input?: Record<string, unknown>;
  output?: string;
}

/**
 * POSTs to /api/v1/copilot/chat/stream and parses the newline-delimited JSON
 * response, invoking `onDelta` for every text chunk and `onTool` for every
 * tool_start/tool_end event (the copilot is a tool-calling agent — see
 * backend/app/ai/agent_copilot.py). Resolves once the terminal "done" event
 * is received.
 */
export async function streamChat(
  params: { message: string; sessionId: string; chatHistory: Message[]; webSearch: boolean },
  onDelta: (delta: string) => void,
  onTool?: (event: ToolEvent) => void,
): Promise<StreamChatResult> {
  const res = await fetch(`${API}/api/v1/copilot/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      message: params.message,
      session_id: params.sessionId,
      chat_history: params.chatHistory,
      web_search: params.webSearch,
    }),
  });
  if (!res.ok || !res.body) throw new Error("Stream request failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: StreamChatResult = { blocked: false, text: "", sessionId: params.sessionId };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let evt: StreamEvent;
      try { evt = JSON.parse(line); } catch { continue; }

      if (evt.delta) {
        onDelta(evt.delta);
      } else if (evt.tool_start && evt.tool) {
        onTool?.({ phase: "start", tool: evt.tool, input: evt.input });
      } else if (evt.tool_end && evt.tool) {
        onTool?.({ phase: "end", tool: evt.tool, output: evt.output });
      } else if (evt.done) {
        result = {
          blocked: !!evt.blocked,
          text: evt.blocked ? (evt.response ?? "") : (evt.final ?? ""),
          sessionId: evt.session_id ?? params.sessionId,
          sources: evt.sources,
          toolSteps: (evt.tool_steps ?? []).map(s => ({
            tool: s.tool, input: s.input ?? {}, output: s.output ?? null, done: true,
          })),
        };
      }
    }
  }
  return result;
}

export interface VoiceChatResult {
  transcript: string;
  response: string;
  status: string;
  sources?: Source[];
}

/** POSTs recorded audio to /api/v1/voice/voice-chat: STT → LLM (server-side session history) → text reply. */
export async function sendVoiceChat(
  blob: Blob,
  params: { sessionId: string; chatHistory: Message[]; webSearch: boolean },
): Promise<VoiceChatResult> {
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  form.append("chat_history", JSON.stringify(params.chatHistory));
  form.append("session_id", params.sessionId);
  form.append("web_search", String(params.webSearch));
  const res = await fetch(`${API}/api/v1/voice/voice-chat`, { method: "POST", body: form, headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Voice chat failed");
  return data as VoiceChatResult;
}

/** Uploads a document/image/audio file with an optional question — same response shape as /chat. */
export async function uploadFileChat(
  file: File,
  message: string,
  sessionId: string,
  webSearch: boolean,
): Promise<ChatResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("message", message);
  form.append("session_id", sessionId);
  form.append("web_search", String(webSearch));
  const res = await axios.post(`${API}/api/v1/copilot/upload`, form);
  return res.data;
}

/** Uploads a chat transcript PDF for persistence in Supabase storage + the transcripts table. */
export async function saveTranscript(
  pdfBlob: Blob,
  filename: string,
  messages: Message[],
  label: string,
): Promise<{ success: boolean; pdf_url: string }> {
  const form = new FormData();
  form.append("pdf", pdfBlob, filename);
  form.append("messages", JSON.stringify(messages));
  form.append("label", label);
  const res = await fetch(`${API}/api/v1/copilot/transcripts/save`, {
    method: "POST", body: form, headers: await authHeaders(),
  });
  return res.json();
}

/** Loads the persisted LLM-context history (chatbot_sessions) for a session id. */
export async function fetchSessionHistory(sessionId: string): Promise<Message[]> {
  try {
    const res = await fetch(`${API}/api/v1/copilot/sessions/${sessionId}/history`);
    if (!res.ok) return [];
    const data = await res.json();
    const history: { role: "user" | "assistant"; content: string }[] = data.messages ?? [];
    return history.map(m => ({ role: m.role, content: m.content }));
  } catch {
    return [];
  }
}

export async function clearCopilotSession(sessionId: string): Promise<void> {
  try { await fetch(`${API}/api/v1/copilot/session/${sessionId}`, { method: "DELETE" }); } catch {}
}

/** Lists saved chat-widget sessions (the "History" list), newest first. */
export async function listSessions(): Promise<SavedSession[]> {
  try {
    const res = await axios.get(`${API}/api/v1/copilot/sessions`);
    return res.data.sessions ?? [];
  } catch {
    return [];
  }
}

/** Creates/updates a saved chat-widget session snapshot — called after each turn. */
export async function upsertSession(id: string, label: string, messages: Message[]): Promise<void> {
  try { await axios.post(`${API}/api/v1/copilot/sessions`, { id, label, messages }); } catch {}
}

export async function deleteSession(id: string): Promise<void> {
  try { await axios.delete(`${API}/api/v1/copilot/sessions/${id}`); } catch {}
}
