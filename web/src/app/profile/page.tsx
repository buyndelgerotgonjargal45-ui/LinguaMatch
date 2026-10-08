"use client";

import { languageName, type ProfileStats } from "@linguamatch/shared";
import { ArrowRight, Clock, MessageCircle, Star, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FullPageSpinner, PageShell } from "@/components/site/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { cn, formatDuration } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Analyzing…",
  insufficient_data: "Too short",
  no_consent: "No transcript",
  failed: "Failed",
};

export default function ProfilePage() {
  const user = useRequireUser();
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) api.profile().then((r) => setProfile(r.profile)).catch((e) => setError(e.message));
  }, [user]);

  if (!user) return <FullPageSpinner />;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.username}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Native: {user.nativeLanguage ? languageName(user.nativeLanguage) : "—"}
            {profile && ` · Member since ${new Date(profile.memberSince).toLocaleDateString()}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/match">
            Start a conversation <ArrowRight />
          </Link>
        </Button>
      </div>

      {error && <p className="text-destructive mt-6 text-sm">{error}</p>}
      {!profile && !error && <div className="text-muted-foreground mt-10 text-sm">Loading your progress…</div>}

      {profile && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard icon={MessageCircle} label="Conversations" value={String(profile.totals.conversations)} />
            <StatCard icon={Clock} label="Practice time" value={formatDuration(profile.totals.practiceSeconds)} />
            <StatCard icon={Star} label="Average AI score" value={profile.totals.averageScore === null ? "—" : `${profile.totals.averageScore}/100`} />
          </div>

          <h2 className="mt-12 text-xl font-semibold">Languages</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {profile.languages.map((l) => (
              <Card key={l.language}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{languageName(l.language)}</CardTitle>
                    {user.activeTargetLanguage === l.language && <Badge variant="secondary">Practicing</Badge>}
                  </div>
                  <CardDescription className="flex items-center gap-2 text-base">
                    <span className="text-foreground font-semibold">{l.level}</span>
                    {l.estimatedPerformance && (
                      <>
                        <ArrowRight className="size-4" />
                        <span className="text-primary font-semibold">{l.estimatedPerformance}</span>
                        <span className="text-xs">latest AI estimate</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm">
                  <div className="text-muted-foreground flex gap-4">
                    <span>{l.conversations} conversations</span>
                    <span>{formatDuration(l.practiceSeconds)} practiced</span>
                  </div>
                  {l.trend.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {l.trend.map((t) => {
                        const delta = t.latest - t.first;
                        return (
                          <div key={t.metric} className="bg-muted/60 rounded-lg p-3">
                            <div className="text-muted-foreground text-xs capitalize">{t.metric}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
                              {t.first} → {t.latest}
                              {delta !== 0 &&
                                (delta > 0 ? <TrendingUp className="text-success size-4" /> : <TrendingDown className="text-warning size-4" />)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Progress trends appear after two analyzed conversations.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <h2 className="mt-12 text-xl font-semibold">Recent conversations</h2>
          {profile.recent.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">No conversations yet. Your reports will show up here.</p>
          ) : (
            <div className="mt-4 divide-y rounded-xl border">
              {profile.recent.map((c) => (
                <Link
                  key={c.conversationId}
                  href={`/feedback/${c.conversationId}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors"
                >
                  <div>
                    <div className="font-medium">{languageName(c.targetLanguage)}</div>
                    <div className="text-muted-foreground text-xs">
                      {c.endedAt ? new Date(c.endedAt).toLocaleString() : "—"} · {formatDuration(c.durationSeconds)}
                    </div>
                  </div>
                  <span className={cn("tabular-nums", c.overallScore === null && "text-muted-foreground text-xs")}>
                    {c.overallScore !== null ? `${c.overallScore}/100` : (STATUS_LABEL[c.status] ?? "—")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card className="py-5">
      <CardContent className="flex items-center gap-4">
        <div className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
