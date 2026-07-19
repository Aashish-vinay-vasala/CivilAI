// Dual-engine text-to-speech playback — shared by the ModuleChat widget and
// the AI Copilot page's voice loop.
//
// "browser" = the OS/browser's own speech engine (window.speechSynthesis) — on
// Windows these are literally named "Microsoft David/Zira/...", and Chrome adds
// "Google US English" etc. Free, instant, no backend round-trip.
// "groq" = the backend's Groq Orpheus TTS voices (server round-trip, MP3).

import type { RefObject } from "react";
import { authHeaders } from "@/lib/apiAuth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export type VoiceChoice =
  | { engine: "browser"; voiceURI: string; name: string }
  | { engine: "groq"; name: string };

export interface SpeakParams {
  text: string;
  voiceChoice: VoiceChoice;
  speechRate: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  onEnd: () => void;
}

export function speak(params: SpeakParams): void {
  const { text, voiceChoice, speechRate, audioRef, onEnd } = params;
  audioRef.current?.pause();
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

  if (voiceChoice.engine === "browser") {
    if (typeof window === "undefined" || !window.speechSynthesis) { onEnd(); return; }
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.voiceURI === voiceChoice.voiceURI) ?? voices.find(v => v.name === voiceChoice.name);
    const utter  = new SpeechSynthesisUtterance(text.slice(0, 1000));
    if (match) utter.voice = match;
    utter.rate = speechRate;
    utter.onend   = onEnd;
    utter.onerror = onEnd;
    window.speechSynthesis.speak(utter);
    return;
  }

  (async () => {
    try {
      const form = new FormData();
      form.append("text", text.slice(0, 1000));
      form.append("voice", voiceChoice.name);
      const res = await fetch(`${API}/api/v1/voice/speak`, { method: "POST", body: form, headers: await authHeaders() });
      if (!res.ok) throw new Error("TTS failed");
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = speechRate;
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); onEnd(); };
      audio.onerror = () => { URL.revokeObjectURL(url); onEnd(); };
      await audio.play();
    } catch {
      onEnd();
    }
  })();
}

export function stopSpeaking(audioRef: RefObject<HTMLAudioElement | null>, onEnd: () => void): void {
  audioRef.current?.pause();
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  onEnd();
}

/** Best-effort default voice — a browser English voice if one's loaded yet, else Groq's default. */
export function pickDefaultVoiceChoice(): VoiceChoice {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      const preferred = voices.find(v => /^en/i.test(v.lang)) ?? voices[0];
      return { engine: "browser", voiceURI: preferred.voiceURI, name: preferred.name };
    }
  }
  return { engine: "groq", name: "autumn" };
}

export async function fetchGroqVoices(): Promise<string[]> {
  try {
    const res  = await fetch(`${API}/api/v1/voice/voices`, { headers: await authHeaders() });
    const data = await res.json();
    return data.voices ?? [];
  } catch {
    return [];
  }
}
