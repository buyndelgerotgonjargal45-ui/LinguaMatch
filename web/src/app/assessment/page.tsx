"use client";

import { TARGET_LANGUAGES, languageName, type AssessmentQuestion, type AssessmentResult } from "@linguamatch/shared";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FullPageSpinner, PageShell } from "@/components/site/header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth, useRequireUser } from "@/lib/auth";

export default function AssessmentPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Assessment />
    </Suspense>
  );
}

function Assessment() {
  const user = useRequireUser({ onboarded: false });
  const { setUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [language, setLanguage] = useState(params.get("language") ?? "");
  const [assessment, setAssessment] = useState<{ id: string; questions: AssessmentQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [busy, setBusy] = useState<null | "start" | "submit" | "apply">(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <FullPageSpinner />;
  const lang = language || user.activeTargetLanguage || "en";
  const currentLevel = user.targetLanguages.find((t) => t.language === lang)?.level;

  async function run<T>(kind: "start" | "submit" | "apply", fn: () => Promise<T>) {
    setError(null);
    setBusy(kind);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell className="max-w-3xl">
      <div className="flex items-center gap-2 text-primary text-sm font-medium">
        <Sparkles className="size-4" /> AI level check
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Find your level</h1>
      <p className="text-muted-foreground mt-2">
        Answer in writing, as much as you can. Skip anything that&apos;s too hard — that&apos;s useful information too.
        A short written check is an estimate, not an exam.
      </p>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {!assessment && (
        <Card className="mt-8">
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="lang">Language to assess</Label>
              <NativeSelect id="lang" value={lang} onChange={(e) => setLanguage(e.target.value)}>
                {TARGET_LANGUAGES.filter((l) => l.code !== user.nativeLanguage).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              disabled={busy !== null}
              onClick={() =>
                run("start", async () => {
                  const a = await api.startAssessment(lang);
                  setAssessment({ id: a.id, questions: a.questions });
                })
              }
            >
              {busy === "start" ? <><Loader2 className="animate-spin" /> Writing your questions…</> : "Start assessment"}
            </Button>
          </CardContent>
        </Card>
      )}

      {assessment && !result && (
        <div className="mt-8 grid gap-4">
          {assessment.questions.map((q, i) => (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Question {i + 1}</Badge>
                  <Badge variant="outline">{q.targetLevel}</Badge>
                </div>
                <CardTitle className="mt-2 text-base leading-relaxed font-medium">{q.prompt}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Your answer (optional)"
                  lang={lang}
                  maxLength={2000}
                />
              </CardContent>
            </Card>
          ))}
          <Button
            size="lg"
            disabled={busy !== null}
            onClick={() =>
              run("submit", async () => {
                const payload = assessment.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }));
                setResult((await api.submitAssessment(assessment.id, payload)).result);
              })
            }
          >
            {busy === "submit" ? <><Loader2 className="animate-spin" /> Evaluating…</> : "Get my level"}
          </Button>
        </div>
      )}

      {assessment && result && (
        <Card className="mt-8">
          <CardHeader>
            <CardDescription>Estimated {languageName(lang)} level</CardDescription>
            <CardTitle className="flex items-center gap-3 text-4xl">
              {result.level}
              <Badge variant="outline" className="text-xs font-normal">{result.confidence} confidence</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 text-sm">
            <p className="leading-relaxed">{result.rationale}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <List title="Strengths" items={result.strengths} />
              <List title="To work on" items={result.areasToImprove} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run("apply", async () => {
                    setUser((await api.applyAssessment(assessment.id)).user);
                    router.push("/match");
                  })
                }
              >
                Use {result.level} and start practicing
              </Button>
              {currentLevel && currentLevel !== result.level && (
                <Button variant="outline" onClick={() => router.push("/match")}>
                  Keep my current level ({currentLevel})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 font-medium">{title}</div>
      <ul className="text-muted-foreground space-y-1.5">
        {items.map((s) => (
          <li key={s}>• {s}</li>
        ))}
      </ul>
    </div>
  );
}
