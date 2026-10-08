"use client";

import { languageName, type CefrLevel } from "@linguamatch/shared";
import { Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FullPageSpinner, Logo } from "@/components/site/header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequireUser } from "@/lib/auth";
import { getSocket, useSocketStatus, type SocketStatus } from "@/lib/socket";
import { formatClock } from "@/lib/utils";

const CONNECTION_MESSAGES: Partial<Record<SocketStatus, string>> = {
  unreachable: "Waking up the server, this can take up to a minute...",
  reconnecting: "Connection lost. Reconnecting… you'll keep your place in the queue.",
  auth_error: "We couldn't verify your session with the matching server. Please reload the page.",
};

export default function MatchPage() {
  const user = useRequireUser();
  const router = useRouter();
  const [waiting, setWaiting] = useState<number | null>(null);
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const language = user?.activeTargetLanguage ?? null;

  const socketStatus = useSocketStatus();

  // Queue membership and socket listeners. Everything registered here is removed on cancel or
  // when leaving the page; the socket itself is shared with /room and stays open.
  useEffect(() => {
    if (!language) return;
    const socket = getSocket();
    let active = true;
    const join = () => {
      if (!active) return;
      setError(null);
      socket.emit("queue:join", { targetLanguage: language });
    };
    const onStatus = (s: { waiting: number; level: CefrLevel }) => {
      setWaiting(s.waiting);
      setLevel(s.level);
    };
    const onMatched = ({ roomId }: { roomId: string }) => {
      if (active) router.push(`/room/${roomId}`);
    };
    const onError = ({ message }: { message: string }) => setError(message);

    socket.on("queue:status", onStatus);
    socket.on("queue:matched", onMatched);
    socket.on("queue:error", onError);
    socket.on("connect", join); // re-queue after every (re)connect
    if (socket.connected) join();

    return () => {
      active = false;
      // Leaving the page leaves the queue (a no-op if we were just matched).
      socket.emit("queue:leave");
      socket.off("queue:status", onStatus);
      socket.off("queue:matched", onMatched);
      socket.off("queue:error", onError);
      socket.off("connect", join);
    };
  }, [language, router]);

  // The wait timer is independent of the connection, so it keeps counting through reconnects.
  useEffect(() => {
    if (!language) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => clearInterval(timer);
  }, [language]);

  if (!user || !language) return <FullPageSpinner />;
  const myLevel = level ?? user.targetLanguages.find((t) => t.language === language)?.level;

  // Unmounting runs the cleanup above (leave queue, remove listeners, stop the timer).
  const cancel = () => router.push("/profile");
  const connectionMessage = CONNECTION_MESSAGES[socketStatus];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <div className="relative mb-10 grid size-36 place-items-center">
          <span className="animate-pulse-ring bg-primary/30 absolute inset-0 rounded-full" />
          <span className="animate-pulse-ring bg-primary/20 absolute inset-0 rounded-full [animation-delay:0.6s]" />
          <span className="bg-primary text-primary-foreground relative grid size-24 place-items-center rounded-full text-2xl font-semibold shadow-lg">
            {myLevel}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Finding your conversation partner…</h1>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary">{languageName(language)}</Badge>
          <Badge variant="outline">Your level: {myLevel}</Badge>
          <Badge variant="outline">
            <Users /> {waiting ?? "–"} waiting
          </Badge>
          <Badge variant="outline" className="font-mono">{formatClock(elapsed)}</Badge>
        </div>
        <p className="text-muted-foreground mt-6 max-w-md text-sm">
          {elapsed < 10
            ? `Looking for someone at exactly ${myLevel}.`
            : "Also looking one level above and below so you don't wait too long."}{" "}
          Keep this tab open — we&apos;ll connect you automatically.
        </p>
        {connectionMessage && (
          <Alert className="mt-6 max-w-md text-left" role="status">
            <AlertDescription>{connectionMessage}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mt-6 max-w-md text-left">
            <AlertDescription className="text-destructive">
              {error}{" "}
              {error.includes("languages") && <Link href="/onboarding" className="underline">Finish setup</Link>}
            </AlertDescription>
          </Alert>
        )}
        <Button variant="outline" className="mt-10" onClick={cancel}>
          <X /> Cancel
        </Button>
        <p className="text-muted-foreground mt-8 max-w-sm text-xs">
          Don&apos;t share personal details with strangers. You can end, skip, block or report anyone at any time.
        </p>
      </main>
    </div>
  );
}
