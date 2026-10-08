"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-bold">Lm</span>
      <span>LinguaMatch</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/profile">
                  <User /> <span className="hidden sm:inline">{user.username}</span>
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label="Settings">
                <Link href="/settings">
                  <Settings />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Log out"
                onClick={async () => {
                  await logout();
                  router.push("/");
                }}
              >
                <LogOut />
              </Button>
              <Button size="sm" asChild className="ml-1">
                <Link href={user.onboarded ? "/match" : "/onboarding"}>Start practicing</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Start practicing</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <SiteHeader />
      <main className={cn("mx-auto w-full max-w-6xl px-4 py-10 sm:px-6", className)}>{children}</main>
    </>
  );
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  );
}
