"use client";

import { MicOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function VideoTile({
  stream,
  label,
  sublabel,
  muted = false,
  mirrored = false,
  showVideo = true,
  micOff = false,
  placeholder,
  className,
}: {
  stream: MediaStream | null;
  label: string;
  sublabel?: string;
  /** Mute playback (always true for your own tile to avoid echo). */
  muted?: boolean;
  mirrored?: boolean;
  showVideo?: boolean;
  micOff?: boolean;
  placeholder?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const hasVideo = showVideo && Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live"));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => !muted && setNeedsGesture(true));
  }, [stream, muted]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-neutral-900", className)}>
      {/* Always mounted so the partner's audio plays even without video. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={cn("size-full object-cover", mirrored && "-scale-x-100", !hasVideo && "invisible")}
      />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center text-neutral-400">
          {placeholder ?? (
            <div className="grid size-20 place-items-center rounded-full bg-neutral-800 text-2xl font-semibold text-neutral-200">
              {label.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      )}
      {needsGesture && (
        <button
          className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white"
          onClick={() => {
            ref.current?.play().then(() => setNeedsGesture(false)).catch(() => {});
          }}
        >
          <span className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2">
            <Volume2 className="size-4" /> Click to hear your partner
          </span>
        </button>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur">
        {micOff && <MicOff className="size-3.5 text-red-300" />}
        <span className="font-medium">{label}</span>
        {sublabel && <span className="text-white/70">{sublabel}</span>}
      </div>
    </div>
  );
}
