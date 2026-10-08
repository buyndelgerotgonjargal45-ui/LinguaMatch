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
import { getSocket } from "@/lib/socket";
import { formatClock } from "@/lib/utils";

export default function MatchPage() {
  const user = useRequireUser();
  const router = useRouter();
  const [waiting, setWaiting] = useState<number | null>(null);
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const language = user?.activeTargetLanguage ?? null;

  useEffect(() => {
    if (!language) return;
    const socket = getSocket();
    const join = () => socket.emit("queue:join", { targetLanguage: language });
    const onStatus = (s: { waiting: number; level: CefrLevel }) => {
      setWaiting(s.waiting);
      setLevel(s.level);
    };
    const onMatched = ({ roomId }: { roomId: string }) => router.push(`/room/${roomId}`);
    const onError = ({ message }: { message: string }) => setError(message);
    const onConnectError = (err: Error) =>
      setError(err.message === "unauthorized" ? "Your session expired. Please log in again." : "Can't reach the server. Retrying…");

    socket.on("queue:status", onStatus);
    socket.on("queue:matched", onMatched);
    socket.on("queue:error", onError);
    socket.on("connect_error", onConnectError);
    socket.on("connect", join); // re-queue after a reconnect
    if (socket.connected) join();

    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => {
      clearInterval(timer);
      // Leaving the page leaves the queue (a no-op if we were just matched).
      socket.emit("queue:leave");
      socket.off("queue:status", onStatus);
      socket.off("queue:matched", onMatched);
      socket.off("queue:error", onError);
      socket.off("connect_error", onConnectError);
      socket.off("connect", join);
    };
  }, [language, router]);

  if (!user || !language) return <FullPageSpinner />;
  const myLevel = level ?? user.targetLanguages.find((t) => t.language === language)?.level;

  const cancel = () => {
    getSocket().emit("queue:leave");
    router.push("/profile");
  };

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
