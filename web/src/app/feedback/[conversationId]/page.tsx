"use client";

import { languageName, type Exercise, type FeedbackDTO } from "@linguamatch/shared";
import { ArrowRight, CheckCircle2, Info, Loader2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FullPageSpinner, PageShell } from "@/components/site/header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, ApiError } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { cn, formatDuration } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  word_choice: "Word choice",
  sentence_structure: "Sentence structure",
};

export default function FeedbackPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const user = useRequireUser();
  const [feedback, setFeedback] = useState<FeedbackDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);

  const load = useCallback(async () => {
    try {
      setFeedback((await api.feedback(conversationId)).feedback);
      setNotReady(false);
    } catch (err) {
      // The report document appears a moment after the call ends.
      if (err instanceof ApiError && err.status === 404) setNotReady(true);
      else setError((err as Error).message);
    }
  }, [conversationId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!(notReady || feedback?.status === "pending")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [notReady, feedback?.status, load]);

  if (!user) return <FullPageSpinner />;

  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-primary flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" /> AI conversation report
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your Conversation Report</h1>
          {feedback && (
            <p className="text-muted-foreground mt-1 text-sm">
              {languageName(feedback.targetLanguage)} · {formatDuration(feedback.conversation.durationSeconds)}
              {feedback.conversation.topics.length > 0 && ` · ${feedback.conversation.topics.join(", ")}`}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/match">
            Find another partner <ArrowRight />
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-8">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {(notReady || feedback?.status === "pending") && (
        <Card className="mt-8">
          <CardContent className="flex items-center gap-4 py-6">
            <Loader2 className="text-primary size-6 animate-spin" />
            <div>
              <div className="font-medium">Analyzing your conversation…</div>
              <div className="text-muted-foreground text-sm">This usually takes under a minute. You can leave and find it later on your profile.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {feedback && ["insufficient_data", "no_consent", "failed"].includes(feedback.status) && (
        <Alert variant="warning" className="mt-8">
          <TriangleAlert />
          <AlertTitle>
            {feedback.status === "failed" ? "We couldn't generate your report" : "No report for this conversation"}
          </AlertTitle>
          <AlertDescription>
            <p>{feedback.statusMessage}</p>
            {feedback.status === "failed" && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={async () => {
                  try {
                    await api.retryFeedback(conversationId);
                    await load();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <RefreshCw /> Try again
              </Button>
            )}
            {feedback.status === "no_consent" && (
              <Link href="/settings" className="text-primary mt-1 hover:underline">
                Open settings
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {feedback?.status === "ready" && <Report feedback={feedback} />}
    </PageShell>
  );
}

function Report({ feedback: f }: { feedback: FeedbackDTO }) {
  return (
    <div className="mt-8 grid gap-6">
      <Card>
        <CardContent className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="flex flex-col justify-center gap-4 md:border-r md:pr-6">
            <div>
              <div className="text-muted-foreground text-xs">Overall level</div>
              <div className="text-2xl font-semibold">{f.level}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Estimated performance</div>
              <div className="text-primary text-2xl font-semibold">{f.estimatedPerformance ?? "—"}</div>
            </div>
          </div>
          <div className="grid gap-4">
            <Score label="Fluency" value={f.fluencyScore} />
            <Score label="Grammar" value={f.grammarScore} />
            <Score label="Vocabulary" value={f.vocabularyScore} />
            <Score label="Pronunciation" value={f.pronunciationScore} note={f.pronunciationNote} />
          </div>
        </CardContent>
      </Card>

      {f.summary && <p className="text-lg leading-relaxed">{f.summary}</p>}

      {f.mistakes.length > 0 && (
        <Section title="Common mistakes" description="Taken from what you actually said. Most important first.">
          <ol className="grid gap-3">
            {f.mistakes.map((m, i) => (
              <li key={i} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">{i + 1}.</span>
                  <Badge variant="secondary">{CATEGORY_LABEL[m.category] ?? m.category}</Badge>
                </div>
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-[90px_1fr]">
                  <span className="text-muted-foreground">You said</span>
                  <span className="decoration-destructive/50 line-through">“{m.original}”</span>
                  <span className="text-muted-foreground">Better</span>
                  <span className="text-success font-medium">“{m.corrected}”</span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">{m.explanation}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {f.vocabularySuggestions.length > 0 && (
        <Section title="Vocabulary improvement">
          <div className="grid gap-3 sm:grid-cols-2">
            {f.vocabularySuggestions.map((v, i) => (
              <div key={i} className="rounded-lg border p-4 text-sm">
                <div className="text-muted-foreground">
                  Instead of <span className="text-foreground font-medium">“{v.original}”</span>, try
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {v.alternatives.map((a) => (
                    <Badge key={a} variant="accent">
                      {a}
                    </Badge>
                  ))}
                </div>
                {v.note && <p className="text-muted-foreground mt-2 text-xs">{v.note}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Fluency">
        {f.metrics && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`${f.metrics.unit} spoken`} value={f.metrics.wordCount} />
            <Stat label={`${f.metrics.unit}/min`} value={f.metrics.ratePerMinute ? Math.round(f.metrics.ratePerMinute) : "—"} />
            <Stat label="Filler words" value={f.metrics.totalFillers} />
            <Stat label="Avg. phrase length" value={f.metrics.averageUtteranceLength.toFixed(1)} />
          </div>
        )}
        {f.metrics && f.metrics.totalFillers > 0 && (
          <p className="mb-3 text-sm">
            You used{" "}
            {Object.entries(f.metrics.fillerCounts)
              .map(([w, c]) => `“${w}” ${c} time${c === 1 ? "" : "s"}`)
              .join(", ")}
            .
          </p>
        )}
        <ul className="grid gap-2 text-sm">
          {f.fluencyNotes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <Info className="text-primary mt-0.5 size-4 shrink-0" /> {n}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-3 text-xs">
          Speaking rate and timing are estimated from speech-recognition timestamps. Recognizers often drop fillers like
          “um”, so the real count may be higher.
        </p>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="What you did well">
          <ul className="grid gap-2 text-sm">
            {f.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" /> {s}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Focus areas">
          <ul className="grid gap-2 text-sm">
            {f.weaknesses.map((s, i) => (
              <li key={i} className="flex gap-2">
                <ArrowRight className="text-primary mt-0.5 size-4 shrink-0" /> {s}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {f.exercises.length > 0 && (
        <Section title="Practice next" description="Exercises built from your mistakes in this conversation.">
          <div className="grid gap-4">
            {f.exercises.map((e, i) => (
              <ExerciseCard key={i} index={i} exercise={e} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Score({ label, value, note }: { label: string; value: number | null; note?: string | null }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", value === null && "text-muted-foreground text-xs")}>
          {value === null ? "Not assessed" : `${value}/100`}
        </span>
      </div>
      {value === null ? (
        note && <p className="text-muted-foreground text-xs leading-relaxed">{note}</p>
      ) : (
        <Progress value={value} indicatorClassName={value >= 75 ? "bg-success" : value >= 55 ? "bg-primary" : "bg-warning"} />
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/60 rounded-lg p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs capitalize">{label}</div>
    </div>
  );
}

function ExerciseCard({ exercise: e, index }: { exercise: Exercise; index: number }) {
  const [showAnswers, setShowAnswers] = useState(false);
  return (
    <div className="rounded-lg border p-4">
      <div className="font-medium">
        {index + 1}. {e.title}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{e.instructions}</p>
      <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm">
        {e.items.map((item, i) => (
          <li key={i}>
            {item}
            {showAnswers && e.answerKey[i] && <div className="text-success mt-0.5 text-xs">→ {e.answerKey[i]}</div>}
          </li>
        ))}
      </ol>
      {e.answerKey.length > 0 && (
        <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setShowAnswers((s) => !s)}>
          {showAnswers ? "Hide answers" : "Show answers"}
        </Button>
      )}
    </div>
  );
}
