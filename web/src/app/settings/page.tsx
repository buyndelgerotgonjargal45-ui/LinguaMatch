"use client";

import { CEFR_LEVELS, NATIVE_LANGUAGES, TARGET_LANGUAGES, languageName, type UserDTO } from "@linguamatch/shared";
import { Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FullPageSpinner, PageShell } from "@/components/site/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth, useRequireUser } from "@/lib/auth";

export default function SettingsPage() {
  const user = useRequireUser({ onboarded: false });
  const { setUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; username: string }[]>([]);
  const [newLanguage, setNewLanguage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (user) api.blocked().then((r) => setBlocked(r.blocked)).catch(() => {});
  }, [user]);

  if (!user) return <FullPageSpinner />;

  async function save(fn: () => Promise<{ user: UserDTO }>) {
    setError(null);
    try {
      setUser((await fn()).user);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const available = TARGET_LANGUAGES.filter(
    (l) => l.code !== user.nativeLanguage && !user.targetLanguages.some((t) => t.language === l.code),
  );

  return (
    <PageShell className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      {error && <p className="text-destructive mt-4 text-sm">{error}</p>}

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Partners only ever see your username, native language and level.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs">Username</div>
              <div className="font-medium">{user.username}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Email (private)</div>
              <div className="font-medium">{user.email}</div>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="native">Native language</Label>
              <NativeSelect
                id="native"
                value={user.nativeLanguage ?? ""}
                onChange={(e) => save(() => api.updateSettings({ nativeLanguage: e.target.value }))}
              >
                {NATIVE_LANGUAGES.map((l) => (
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
            <CardTitle>Languages & levels</CardTitle>
            <CardDescription>You&apos;re matched in the language marked “practicing”.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {user.targetLanguages.map((t) => (
              <div key={t.language} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-32 flex-1">
                  <div className="font-medium">{languageName(t.language)}</div>
                  <div className="text-muted-foreground text-xs">
                    {t.levelSource === "assessment" ? "Level from AI assessment" : "Self-reported level"}
                  </div>
                </div>
                <div className="w-24">
                  <NativeSelect value={t.level} onChange={(e) => save(() => api.setLanguage(t.language, e.target.value))} aria-label="Level">
                    {CEFR_LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </NativeSelect>
                </div>
                {user.activeTargetLanguage === t.language ? (
                  <span className="text-primary text-xs font-medium">Practicing</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => save(() => api.updateSettings({ activeTargetLanguage: t.language }))}>
                    Practice this
                  </Button>
                )}
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/assessment?language=${t.language}`}>
                    <Sparkles /> Assess
                  </Link>
                </Button>
                {user.targetLanguages.length > 1 && (
                  <Button size="icon" variant="ghost" aria-label="Remove language" onClick={() => save(() => api.removeLanguage(t.language))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {available.length > 0 && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <NativeSelect value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} aria-label="Add language">
                    <option value="">Add a language…</option>
                    {available.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Button
                  variant="outline"
                  disabled={!newLanguage}
                  onClick={async () => {
                    await save(() => api.setLanguage(newLanguage, "A1"));
                    setNewLanguage("");
                  }}
                >
                  Add at A1
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>Audio and video are peer-to-peer and never recorded or stored by LinguaMatch.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ToggleRow
              id="transcription"
              label="Transcribe my speech for AI feedback"
              description="Your browser converts only your own speech to text (in Chrome/Edge via the browser vendor's speech service). The text goes to our server and AI provider to build your report. Applies from your next conversation."
              checked={user.privacy.transcriptionConsent}
              onChange={(v) => save(() => api.updateSettings({ privacy: { transcriptionConsent: v } }))}
            />
            <ToggleRow
              id="retain"
              label="Keep my conversation transcripts"
              description="Off by default: transcripts are deleted once reports are generated. A transcript is kept only if both participants turned this on."
              checked={user.privacy.retainTranscripts}
              onChange={(v) => save(() => api.updateSettings({ privacy: { retainTranscripts: v } }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked users</CardTitle>
            <CardDescription>You&apos;ll never be matched with these people.</CardDescription>
          </CardHeader>
          <CardContent>
            {blocked.length === 0 ? (
              <p className="text-muted-foreground text-sm">You haven&apos;t blocked anyone.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    {b.username}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.unblock(b.id);
                        setBlocked((list) => list.filter((x) => x.id !== b.id));
                      }}
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Delete account</CardTitle>
            <CardDescription>Permanently deletes your account, reports, assessments and any stored transcripts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await api.deleteAccount();
                setUser(null);
                router.push("/");
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
