"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface RecognizedSegment {
  text: string;
  startedAt: number;
  endedAt: number;
  confidence: number | null;
}

export type SpeechStatus = "unsupported" | "idle" | "listening" | "denied" | "error";

/**
 * Transcribes ONLY the local user's microphone with the browser's speech recognizer and
 * reports each finalized phrase. Audio is handled by the browser; nothing is recorded here.
 */
export function useSpeechRecognition(opts: {
  locale: string;
  enabled: boolean;
  onSegment: (segment: RecognizedSegment) => void;
}) {
  const [status, setStatus] = useState<SpeechStatus>(() => (getRecognitionCtor() ? "idle" : "unsupported"));
  const onSegmentRef = useRef(opts.onSegment);
  onSegmentRef.current = opts.onSegment;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    if (!opts.enabled) {
      setStatus("idle");
      return;
    }

    let stopped = false;
    let phraseStart: number | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const recognition = new Ctor();
    recognition.lang = opts.locale;
    recognition.continuous = true;
    recognition.interimResults = true; // used to timestamp when a phrase starts
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const alt = result[0];
        if (!alt) continue;
        phraseStart ??= Date.now();
        if (!result.isFinal) continue;
        const text = alt.transcript.trim();
        if (text) {
          const endedAt = Date.now();
          onSegmentRef.current({
            text,
            startedAt: Math.min(phraseStart, endedAt - 300),
            endedAt,
            // Browsers report 0 when they don't compute confidence.
            confidence: alt.confidence > 0 ? alt.confidence : null,
          });
        }
        phraseStart = null;
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        setStatus("denied");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[speech] recognition error:", e.error);
      }
    };
    // Recognizers stop on their own after silence or ~60s; keep restarting while enabled.
    recognition.onend = () => {
      phraseStart = null;
      if (stopped) return;
      restartTimer = setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setStatus("error");
        }
      }, 250);
    };

    try {
      recognition.start();
    } catch {
      setStatus("error");
    }

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognition.onend = null;
      recognition.abort();
    };
  }, [opts.enabled, opts.locale]);

  return { status, supported: status !== "unsupported" };
}
