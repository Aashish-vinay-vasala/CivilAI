"use client";

/**
 * VoiceButton — compact mic button for embedding voice input anywhere.
 *
 * Pipeline:
 *   1. Web Speech API streams live interim transcript while user speaks
 *   2. MediaRecorder captures audio (webm/opus) in parallel
 *   3. On stop: audio blob → POST /api/v1/voice/voice-chat → JSON {transcript, response}
 *   4. Response text → POST /api/v1/voice/speak → Groq PlayAI TTS MP3, played back
 *   5. onResult(transcript, response) is called for the parent to show the exchange
 *
 * Usage:
 *   <VoiceButton
 *     chatHistory={messages}
 *     onResult={(transcript, response) => { ... }}
 *     onInterim={(text) => setLive(text)}   // optional live display
 *   />
 */

import { useRef, useState, useCallback } from "react";
import { Mic, MicOff, Loader2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWebSpeechSTT } from "@/hooks/useWebSpeechSTT";
import { supabase } from "@/lib/supabase";

// The voice routes require an authenticated session (require_module_access on the
// backend), but these calls use plain `fetch` rather than the axios instance the
// app's auth interceptor patches — so the bearer token has to be attached by hand.
async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Props {
  chatHistory?: { role: string; content: string }[];
  onResult?:   (transcript: string, response: string) => void;
  onInterim?:  (text: string) => void;
  onError?:    (err: string) => void;
  sessionId?:  string;
  className?:  string;
  size?:       "sm" | "md" | "lg";
}

type State = "idle" | "recording" | "processing" | "playing";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VoiceButton({
  chatHistory = [],
  onResult,
  onInterim,
  onError,
  sessionId = "",
  className,
  size = "md",
}: Props) {
  const [state, setState] = useState<State>("idle");
  const stateRef          = useRef<State>("idle");
  const recorderRef       = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const audioRef          = useRef<HTMLAudioElement | null>(null);

  const setS = (s: State) => { stateRef.current = s; setState(s); };

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-6 h-6" : "w-4 h-4";
  const btnSize  = size === "lg" ? "w-14 h-14" : size === "sm" ? "w-8 h-8" : "w-10 h-10";

  // Live STT for interim display
  const stt = useWebSpeechSTT({
    onInterim: (text) => onInterim?.(text),
    onFinal:   (text) => onInterim?.(text),
  });

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const sendAudio = useCallback(async (blob: Blob) => {
    setS("processing");
    onInterim?.("");
    try {
      const form = new FormData();
      form.append("audio",        blob, "recording.webm");
      form.append("chat_history", JSON.stringify(chatHistory));
      form.append("session_id",   sessionId);

      const res  = await fetch(`${API}/api/v1/voice/voice-chat`, {
        method: "POST", body: form, headers: await authHeader(),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      const { transcript, response } = data as { transcript: string; response: string };

      // Speak the response using Groq PlayAI TTS
      if (response) {
        audioRef.current?.pause();
        setS("playing");
        try {
          const ttsForm = new FormData();
          ttsForm.append("text", response.slice(0, 1000));
          ttsForm.append("voice", "autumn");
          const ttsRes = await fetch(`${API}/api/v1/voice/speak`, {
            method: "POST", body: ttsForm, headers: await authHeader(),
          });
          if (!ttsRes.ok) throw new Error("TTS request failed");
          const blob  = await ttsRes.blob();
          const url   = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(url); setS("idle"); };
          audio.onerror = () => { URL.revokeObjectURL(url); setS("idle"); };
          await audio.play();
        } catch {
          setS("idle");
        }
      } else {
        setS("idle");
      }

      onResult?.(transcript, response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voice chat failed";
      onError?.(msg);
      setS("idle");
    }
  }, [chatHistory, sessionId, onResult, onError, onInterim]);

  const startRecording = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    audioRef.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stopStream();
        sendAudio(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.start(250);

      // Start Web Speech API for live interim display in parallel
      if (stt.isSupported) stt.start();

      setS("recording");
    } catch {
      onError?.("Microphone access denied. Please allow microphone access and try again.");
      setS("idle");
    }
  }, [sendAudio, onError, stt]);

  const stopRecording = useCallback(() => {
    stt.stop();
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    stopStream();
  }, [stt]);

  const handleClick = () => {
    const s = stateRef.current;
    if (s === "idle")      return startRecording();
    if (s === "recording") return stopRecording();
    if (s === "playing") {
      audioRef.current?.pause();
      setS("idle");
    }
  };

  const icon = {
    idle:       <Mic     className={iconSize} />,
    recording:  <MicOff  className={cn(iconSize)} />,
    processing: <Loader2 className={cn(iconSize, "animate-spin")} />,
    playing:    <VolumeX className={iconSize} />,
  }[state];

  const label = {
    idle:       "Start voice input",
    recording:  "Stop recording",
    processing: "Processing…",
    playing:    "Stop playback",
  }[state];

  return (
    <Button
      type="button"
      size="icon"
      onClick={handleClick}
      disabled={state === "processing"}
      title={label}
      className={cn(
        "rounded-full transition-all duration-200 border-0 flex items-center justify-center",
        btnSize,
        state === "recording"
          ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/50 animate-pulse"
          : state === "playing"
          ? "bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500/30"
          : state === "processing"
          ? "bg-secondary text-muted-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70",
        className,
      )}
    >
      {icon}
    </Button>
  );
}
