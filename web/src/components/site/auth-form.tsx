"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/site/header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(user.onboarded ? (next ?? "/match") : "/onboarding");
  }, [user, next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      const { user } =
        mode === "signup"
          ? await api.register({
              username: String(form.get("username")),
              email: String(form.get("email")),
              password: String(form.get("password")),
            })
          : await api.login({ identifier: String(form.get("identifier")), password: String(form.get("password")) });
      setUser(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {mode === "signup"
              ? "Your username is the only thing partners will see."
              : "Log in to keep practicing."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            {mode === "signup" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" />
                  <p className="text-muted-foreground text-xs">Avoid using your real name.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="identifier">Username or email</Label>
                <Input id="identifier" name="identifier" required autoComplete="username" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === "signup" ? 8 : 1}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-destructive">{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-6 text-center text-sm">
            {mode === "signup" ? (
              <>
                Already have an account? <Link className="text-primary hover:underline" href="/login">Log in</Link>
              </>
            ) : (
              <>
                New here? <Link className="text-primary hover:underline" href="/signup">Create an account</Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
