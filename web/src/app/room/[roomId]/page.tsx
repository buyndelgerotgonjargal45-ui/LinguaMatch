"use client";

import {
  getTargetLanguage,
  languageName,
  type CefrLevel,
  type PartnerInfo,
  type RoomEndReason,
  type ServerToClientEvents,
  type Topic,
} from "@linguamatch/shared";
import { Ban, Flag, Loader2, Mic, MicOff, PhoneOff, SkipForward, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachPanel } from "@/components/room/coach-panel";
import { BlockDialog, ReportDialog } from "@/components/room/safety-dialogs";
import { VideoTile } from "@/components/room/video-tile";
import { FullPageSpinner } from "@/components/site/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { useSpeechRecognition, type RecognizedSegment } from "@/hooks/useSpeechRecognition";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useRequireUser } from "@/lib/auth";
import { getSocket, type AppSocket } from "@/lib/socket";
import { cn, formatClock } from "@/lib/utils";

type RoomReady = Parameters<ServerToClientEvents["room:ready"]>[0];

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const user = useRequireUser();
  const router = useRouter();
  const media = useLocalMedia();
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const rtc = useWebRTC(socket, roomId, media.stream);

  const [info, setInfo] = useState<{ partner: PartnerInfo; targetLanguage: string; yourLevel: CefrLevel; startedAt: number } | null>(null);
  const [partnerPresent, setPartnerPresent] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [topicLoading, setTopicLoading] = useState(true);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [ended, setEnded] = useState<{ reason: RoomEndReason } | null>(null);
  const [dialog, setDialog] = useState<null | "report" | "block">(null);
  const [now, setNow] = useState(Date.now());

  /** What *I* did, so we know where to go when the server confirms the room ended. */
  const myAction = useRef<null | "ended" | "next" | "moderation">(null);
  const joined = useRef(false);
  const mounted = useRef(false);
  const startRtc = rtc.start;

  useEffect(() => {
    setSocket(getSocket());
  }, []);

  // Join once media is resolved (granted, audio-only, or denied — the call still works receive-only).
  useEffect(() => {
    if (!socket || !user || media.status === "pending" || joined.current) return;
    joined.current = true;
    if (socket.connected) socket.emit("room:join", { roomId });
  }, [socket, user, media.status, roomId]);

  // Rejoin after a network blip; the server holds the room for a 20s grace period.
  useEffect(() => {
    if (!socket) return;
    const rejoin = () => joined.current && socket.emit("room:join", { roomId });
    socket.on("connect", rejoin);
    return () => {
      socket.off("connect", rejoin);
    };
  }, [socket, roomId]);

  // Navigating away without pressing End still ends the call (deferred so React's dev double-mount doesn't).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current && !myAction.current) getSocket().emit("room:leave", { roomId, reason: "ended" });
      }, 0);
    };
  }, [roomId]);

  useEffect(() => {
    if (!socket) return;
    const onReady = (r: RoomReady) => {
      setInfo({ partner: r.partner, targetLanguage: r.targetLanguage, yourLevel: r.yourLevel, startedAt: Date.parse(r.startedAt) });
      setPartnerPresent(true);
      if (r.topic) {
        setTopic(r.topic);
        setTopicLoading(false);
      }
      void startRtc(r.role, r.iceServers);
    };
    const onWaiting = () => setPartnerPresent(false);
    const onTopic = (t: { topic: Topic | null; loading: boolean; error?: string }) => {
      if (t.topic) setTopic(t.topic);
      setTopicLoading(t.loading);
      setTopicError(t.error ?? null);
    };
    const onEnded = (e: { conversationId: string; reason: RoomEndReason; byPartner: boolean }) => {
      if (e.conversationId !== roomId) return;
      myAction.current ??= "moderation";
      if (!e.byPartner) {
        router.push(myAction.current === "next" ? "/match" : `/feedback/${roomId}`);
      } else {
        setEnded({ reason: e.reason });
      }
    };
    const onError = ({ message }: { message: string }) => setRoomError(message);

    socket.on("room:ready", onReady);
    socket.on("room:waiting-partner", onWaiting);
    socket.on("topic:update", onTopic);
    socket.on("room:ended", onEnded);
    socket.on("room:error", onError);
    return () => {
      socket.off("room:ready", onReady);
      socket.off("room:waiting-partner", onWaiting);
      socket.off("topic:update", onTopic);
      socket.off("room:ended", onEnded);
      socket.off("room:error", onError);
    };
  }, [socket, roomId, router, startRtc]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Speech-to-text on MY mic only, and only with consent, while unmuted and in an active call.
  const consent = Boolean(user?.privacy.transcriptionConsent);
  const speechLocale = getTargetLanguage(info?.targetLanguage ?? "")?.speechLocale ?? "en-US";
  const onSegment = useCallback(
    (s: RecognizedSegment) => socket?.emit("transcript:segment", { roomId, ...s }),
    [socket, roomId],
  );
  const speech = useSpeechRecognition({
    locale: speechLocale,
    enabled: consent && media.micOn && Boolean(info) && !ended,
    onSegment,
  });

  const leave = (reason: "ended" | "next") => {
    myAction.current = reason;
    socket?.emit("room:leave", { roomId, reason });
  };
  const afterModeration = () => {
    myAction.current = "moderation";
    setDialog(null);
  };

  if (!user) return <FullPageSpinner />;

  if (roomError) {
    return (
      <div className="dark bg-background text-foreground grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg">{roomError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link href="/match">Find a partner</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/profile">Your profile</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const elapsed = info ? (now - info.startedAt) / 1000 : 0;
  const partner = info?.partner;

  return (
    <div className="dark bg-background text-foreground flex min-h-dvh flex-col">
      {/* TOP: language, level, timer */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{info ? languageName(info.targetLanguage) : "…"}</Badge>
          {info && <Badge variant="outline">Your level: {info.yourLevel}</Badge>}
          <ConnectionBadge state={rtc.state} partnerPresent={partnerPresent} />
        </div>
        <div className="font-mono text-sm tabular-nums">{formatClock(elapsed)}</div>
      </header>

      {media.status === "denied" && (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-200">
          Camera and microphone access is blocked, so your partner can&apos;t see or hear you. Allow access in your
          browser&apos;s site settings and reload.
        </div>
      )}
      {consent && speech.status === "unsupported" && (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-200">
          This browser has no built-in speech-to-text, so no feedback report can be made for you. Use Chrome or Edge
          for AI feedback.
        </div>
      )}

      <main className="grid flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {/* LEFT: you */}
          <VideoTile
            stream={media.stream}
            label="You"
            sublabel={info?.yourLevel}
            muted
            mirrored
            showVideo={media.camOn}
            micOff={!media.micOn}
            className="aspect-video md:aspect-auto md:min-h-[320px]"
          />
          {/* RIGHT: partner */}
          <VideoTile
            stream={rtc.remoteStream}
            label={partner?.displayName ?? "Partner"}
            sublabel={partner ? `${partner.level}${partner.nativeLanguage ? ` · speaks ${languageName(partner.nativeLanguage)}` : ""}` : undefined}
            className="aspect-video md:aspect-auto md:min-h-[320px]"
            placeholder={
              !partnerPresent ? (
                <div className="flex flex-col items-center gap-3 text-sm">
                  <Loader2 className="size-6 animate-spin" />
                  {info ? "Your partner is reconnecting…" : "Connecting to your partner…"}
                </div>
              ) : undefined
            }
          />
        </div>

        {/* SIDEBAR: AI coach */}
        <CoachPanel
          topic={topic}
          loading={topicLoading}
          error={topicError}
          onNewTopic={() => socket?.emit("topic:request", { roomId })}
          speech={{ status: consent ? speech.status : "off", muted: !media.micOn }}
        />
      </main>

      {/* Controls */}
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-4">
        <ControlButton active={media.micOn} onClick={media.toggleMic} label={media.micOn ? "Mute" : "Unmute"}>
          {media.micOn ? <Mic /> : <MicOff />}
        </ControlButton>
        <ControlButton
          active={media.camOn}
          onClick={media.toggleCam}
          disabled={!media.hasVideo}
          label={media.camOn ? "Camera off" : "Camera on"}
        >
          {media.camOn ? <Video /> : <VideoOff />}
        </ControlButton>
        <div className="mx-2 h-8 w-px bg-white/10" />
        <Button variant="secondary" onClick={() => leave("next")} disabled={!info}>
          <SkipForward /> Next partner
        </Button>
        <Button variant="destructive" onClick={() => leave("ended")}>
          <PhoneOff /> End
        </Button>
        <div className="mx-2 h-8 w-px bg-white/10" />
        <Button variant="ghost" size="sm" onClick={() => setDialog("block")} disabled={!info}>
          <Ban /> Block
        </Button>
        <Button variant="ghost" size="sm" className="text-red-300 hover:text-red-200" onClick={() => setDialog("report")} disabled={!info}>
          <Flag /> Report
        </Button>
      </footer>

      <ReportDialog conversationId={roomId} open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} onDone={afterModeration} />
      <BlockDialog
        conversationId={roomId}
        partnerName={partner?.displayName ?? "this person"}
        open={dialog === "block"}
        onOpenChange={(o) => setDialog(o ? "block" : null)}
        onDone={afterModeration}
      />

      <Dialog open={Boolean(ended)}>
        <DialogContent className="dark bg-card text-foreground [&>button:last-child]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{ended?.reason === "disconnected" ? "Your partner lost connection" : "Your partner left the conversation"}</DialogTitle>
            <DialogDescription>Your AI report is being prepared. You can read it now or jump into another conversation.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => router.push(`/feedback/${roomId}`)}>
              See my feedback
            </Button>
            <Button onClick={() => router.push("/match")}>Find another partner</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ControlButton({
  active,
  label,
  children,
  ...props
}: React.ComponentProps<"button"> & { active: boolean; label: string }) {
  return (
    <Button
      size="icon"
      variant="secondary"
      aria-label={label}
      title={label}
      className={cn("rounded-full", !active && "bg-red-500/90 text-white hover:bg-red-500")}
      {...props}
    >
      {children}
    </Button>
  );
}

function ConnectionBadge({ state, partnerPresent }: { state: string; partnerPresent: boolean }) {
  if (!partnerPresent) return <Badge variant="outline">Waiting for partner</Badge>;
  const label: Record<string, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    failed: "Connection failed",
    idle: "Connecting…",
  };
  return (
    <Badge variant="outline" className={cn(state === "connected" && "border-emerald-500/40 text-emerald-300", state === "failed" && "border-red-500/40 text-red-300")}>
      {label[state] ?? state}
    </Badge>
  );
}
