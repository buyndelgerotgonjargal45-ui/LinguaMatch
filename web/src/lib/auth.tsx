"use client";

import type { UserDTO } from "@linguamatch/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";
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

  const refresh = useCallback(async () => {
    try {
      setUser((await api.me()).user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      else console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    disconnectSocket();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
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
