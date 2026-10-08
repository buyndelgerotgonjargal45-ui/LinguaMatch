"use client";

import { NATIVE_LANGUAGES, TARGET_LANGUAGES, type CefrLevel } from "@linguamatch/shared";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommunityRules } from "@/components/site/community-rules";
import { FullPageSpinner, PageShell } from "@/components/site/header";
import { LevelPicker } from "@/components/site/level-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth, useRequireUser } from "@/lib/auth";

export default function OnboardingPage() {
  const user = useRequireUser({ onboarded: false });
  const { setUser } = useAuth();
  const router = useRouter();

  const [nativeLanguage, setNativeLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [transcription, setTranscription] = useState(true);
  const [acceptRules, setAcceptRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.nativeLanguage) setNativeLanguage(user.nativeLanguage);
    const active = user.targetLanguages.find((t) => t.language === user.activeTargetLanguage) ?? user.targetLanguages[0];
    if (active) {
      setTargetLanguage(active.language);
      setLevel(active.level);
    }
    setTranscription(user.privacy.transcriptionConsent || !user.rulesAcceptedAt);
    setAcceptRules(Boolean(user.rulesAcceptedAt));
  }, [user]);

  if (!user) return <FullPageSpinner />;

  async function save(thenAssess = false) {
    setError(null);
    if (!nativeLanguage) return setError("Choose your native language.");
    if (!level && !thenAssess) return setError("Choose your level, or let AI assess you.");
    if (!acceptRules) return setError("Please accept the community rules.");
    setSaving(true);
    try {
      const { user } = await api.onboarding({
        nativeLanguage,
        targetLanguage,
        level: level ?? "A1",
        acceptRules: true,
        transcriptionConsent: transcription,
      });
      setUser(user);
      router.push(thenAssess ? `/assessment?language=${targetLanguage}` : "/match");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Set up your practice</h1>
      <p className="text-muted-foreground mt-2">This decides who you're matched with and how hard your topics are.</p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Languages</CardTitle>
            <CardDescription>
              Your native language is shown to partners for context only — it's never used to guess your level.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="native">Native language</Label>
              <NativeSelect id="native" value={nativeLanguage} onChange={(e) => setNativeLanguage(e.target.value)}>
                <option value="" disabled>
                  Select…
                </option>
                {NATIVE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="target">I want to practice</Label>
              <NativeSelect id="target" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                {TARGET_LANGUAGES.filter((l) => l.code !== nativeLanguage).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your current level</CardTitle>
            <CardDescription>Based on the Common European Framework (CEFR). Pick the one that sounds most like you.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LevelPicker value={level} onChange={setLevel} />
            <div className="bg-primary/5 flex flex-col items-start justify-between gap-3 rounded-lg border border-primary/20 p-4 sm:flex-row sm:items-center">
              <div className="flex gap-3">
                <Sparkles className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Not sure about your level?</div>
                  <div className="text-muted-foreground text-sm">Answer 6 short questions and let AI estimate it.</div>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={saving} onClick={() => save(true)}>
                Let AI assess me
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy & safety</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="transcription">Transcribe my speech for AI feedback</Label>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Your browser converts <em>only your own</em> microphone to text during calls. In Chrome and Edge this
                  uses the browser vendor&apos;s speech service. Audio and video are never recorded or stored by
                  LinguaMatch. Text transcripts are deleted after your report is generated unless you choose to keep
                  them in Settings. Without this, you won&apos;t get a feedback report.
                </p>
              </div>
              <Switch id="transcription" checked={transcription} onCheckedChange={setTranscription} />
            </div>
            <CommunityRules />
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="accent-primary mt-0.5 size-4"
                checked={acceptRules}
                onChange={(e) => setAcceptRules(e.target.checked)}
              />
              <span>
                I&apos;m 18 or older and I agree to the community rules. I understand I&apos;ll be talking with
                strangers. <Link href="/rules" className="text-primary hover:underline">Read more</Link>
              </span>
            </label>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button size="lg" disabled={saving} onClick={() => save(false)}>
            {saving ? "Saving…" : "Continue to matching"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
