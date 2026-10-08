"use client";

import type { UserDTO } from "@linguamatch/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api, onSessionLost, refreshSession, serverStatusStore } from "./api";
import { disconnectSocket } from "./socket";

interface AuthContextValue {
  user: UserDTO | null;
  loading: boolean;
  setUser: (user: UserDTO | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Restores the session from the refresh cookie. Only a 401 signs the user out; if the server
   * can't be reached we stay in the loading state and try again, so nobody is sent to /login
   * just because the API is asleep.
   */
  const refresh = useCallback(async () => {
    for (let delay = 5000; ; delay = Math.min(delay * 2, 30_000)) {
      try {
        setUser(await refreshSession());
        setLoading(false);
        return;
      } catch (err) {
        console.error("[auth] couldn't reach the server to restore the session:", err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A rejected refresh anywhere (API call or socket) means the session is really gone.
  useEffect(() => {
    onSessionLost(() => {
      disconnectSocket();
      setUser(null);
    });
    return () => onSessionLost(null);
  }, []);

  const logout = useCallback(async () => {
    disconnectSocket();
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>
      <ServerWakeBanner />
      {children}
    </AuthContext.Provider>
  );
}

/** Shown while API requests are being retried because the server is asleep or restarting. */
function ServerWakeBanner() {
  const status = useSyncExternalStore(serverStatusStore.subscribe, serverStatusStore.get, () => "ok" as const);
  if (status !== "waking") return null;
  return (
    <div role="status" className="bg-primary text-primary-foreground fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-sm">
      Waking up the server, this can take up to a minute...
    </div>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Client-side route guard. Redirects to /login when signed out and to /onboarding when
 * the profile is incomplete. Returns the user once it's safe to render.
 */
export function useRequireUser({ onboarded = true }: { onboarded?: boolean } = {}): UserDTO | null {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (onboarded && !user.onboarded) router.replace("/onboarding");
  }, [loading, user, onboarded, router, pathname]);

  if (loading || !user || (onboarded && !user.onboarded)) return null;
  return user;
}
