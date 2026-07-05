"use client";

/**
 * useWebSpeechSTT — live streaming speech-to-text via the browser's Web Speech API.
 *
 * Gives real-time interim results as the user speaks, making recording feel
 * responsive immediately (vs. waiting for the Groq Whisper batch upload to return).
 *
 * Browser support: Chrome, Edge, Safari 15+. Firefox has limited support.
 * Falls back gracefully when not supported (isSupported = false).
 *
 * Usage:
 *   const { isListening, interim, isSupported, start, stop } = useWebSpeechSTT({
 *     onFinal: (text) => setTranscript(text),
 *   });
 */

import { useCallback, useRef, useState } from "react";

interface Options {
  lang?:       string;
  onInterim?:  (text: string) => void;
  onFinal?:    (text: string) => void;
  onError?:    (err: string) => void;
}

interface WebSpeechSTT {
  isListening: boolean;
  interim:     string;
  isSupported: boolean;
  start:       () => void;
  stop:        () => void;
}

declare global {
  interface Window {
    SpeechRecognition:       typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
  }
}

export function useWebSpeechSTT({
  lang       = "en-US",
  onInterim,
  onFinal,
  onError,
}: Options = {}): WebSpeechSTT {
  const [isListening, setIsListening] = useState(false);
  const [interim,     setInterim]     = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!isSupported || isListening) return;

    const SpeechRec =
      window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SpeechRec();

    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText   = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (interimText) {
        setInterim(interimText);
        onInterim?.(interimText);
      }
      if (finalText) {
        setInterim("");
        onFinal?.(finalText);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      const msg =
        e.error === "no-speech"      ? "No speech detected — please try again." :
        e.error === "not-allowed"    ? "Microphone access denied." :
        e.error === "network"        ? "Network error during recognition." :
        `Speech recognition error: ${e.error}`;
      onError?.(msg);
      setIsListening(false);
      setInterim("");
    };

    rec.onend = () => {
      setIsListening(false);
      setInterim("");
    };

    rec.start();
    recRef.current = rec;
    setIsListening(true);
  }, [isSupported, isListening, lang, onInterim, onFinal, onError]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
    setInterim("");
  }, []);

  return { isListening, interim, isSupported, start, stop };
}
