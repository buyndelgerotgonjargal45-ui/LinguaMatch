"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaStatus = "pending" | "ready" | "audio-only" | "denied" | "unavailable";

/** Acquires camera + mic, falling back to audio-only, and exposes mute/camera toggles. */
export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>("pending");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        setStream(s);
        setStatus("ready");
      } catch (err) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          streamRef.current = s;
          setStream(s);
          setCamOn(false);
          setStatus("audio-only");
        } catch {
          setStatus((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
        }
      }
    };
    void acquire();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((on) => {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  return { stream, status, micOn, camOn, toggleMic, toggleCam, hasVideo: Boolean(stream?.getVideoTracks().length) };
}
