import type { AssessmentQuestion, AssessmentResult, FeedbackDTO, ProfileStats, UserDTO } from "@linguamatch/shared";

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server couldn't be reached at all. */
    public status: number,
    message: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

// ─── Server reachability ────────────────────────────────────────────────────
// The API runs on Render's free tier, which sleeps when idle and takes up to a minute to wake.
// While it does, the Vercel proxy answers 502/503/504 or the request fails outright.

export type ServerStatus = "ok" | "waking";
let serverStatus: ServerStatus = "ok";
const statusListeners = new Set<() => void>();

function setServerStatus(next: ServerStatus) {
  if (next === serverStatus) return;
  serverStatus = next;
  statusListeners.forEach((l) => l());
}

export const serverStatusStore = {
  get: () => serverStatus,
  subscribe: (listener: () => void) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  },
};

// 502/503 mean the request never reached the app. A 504 may have, so only safe requests retry it.
const isWakingStatus = (status: number, retrySafe: boolean) => status === 502 || status === 503 || (status === 504 && retrySafe);
const WAKE_GIVE_UP_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() that retries with exponential backoff while the server is unreachable or waking up. */
async function fetchWithWake(path: string, init: RequestInit, retrySafe = !init.method || init.method === "GET"): Promise<Response> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api${path}`, init);
      if (!isWakingStatus(res.status, retrySafe)) {
        setServerStatus("ok");
        return res;
      }
    } catch {
      // Network error: the server is down or asleep, not an auth problem. Keep trying below.
    }
    if (Date.now() - started > WAKE_GIVE_UP_MS) {
      setServerStatus("ok");
      throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    }
    setServerStatus("waking");
    await sleep(Math.min(1000 * 2 ** attempt, 10_000) * (0.75 + Math.random() * 0.5));
  }
}

// ─── Session ────────────────────────────────────────────────────────────────
// The access token lives only in memory. The refresh token is an httpOnly cookie on this
// site's own domain (/api is proxied to the API), so it survives reloads and works in Incognito.

interface SessionResponse {
  user: UserDTO;
  accessToken: string;
  accessTokenExpiresAt: number;
}

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshing: Promise<UserDTO | null> | null = null;
let sessionLostHandler: (() => void) | null = null;

function setSession(session: SessionResponse): UserDTO {
  accessToken = session.accessToken;
  accessTokenExpiresAt = session.accessTokenExpiresAt;
  return session.user;
}

function clearSession() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}

/** Called when the server says the session is gone (refresh rejected), so the app can show login. */
export function onSessionLost(handler: (() => void) | null) {
  sessionLostHandler = handler;
}

/**
 * Trades the refresh cookie for a new access token. Concurrent callers share one request.
 * Resolves to null only when the server rejects the session (401); network trouble throws.
 */
export function refreshSession(): Promise<UserDTO | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetchWithWake("/auth/refresh", { method: "POST", credentials: "same-origin" }, true);
      if (res.status === 401) {
        clearSession();
        sessionLostHandler?.();
        return null;
      }
      if (!res.ok) throw new ApiError(res.status, `Couldn't restore your session (${res.status})`);
      return setSession((await res.json()) as SessionResponse);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** A valid access token for the socket handshake, refreshing first if it's missing or about to expire. */
export async function getFreshAccessToken(): Promise<string | null> {
  if (accessToken && accessTokenExpiresAt - Date.now() > 30_000) return accessToken;
  return (await refreshSession()) ? accessToken : null;
}

// Endpoints whose 401 means "wrong credentials" or "no session", not "token expired".
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"]);

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}, isRetry = false): Promise<T> {
  // Refresh ahead of expiry so a long wait doesn't cost a 401 round trip.
  if (accessToken && accessTokenExpiresAt - Date.now() < 30_000 && !NO_REFRESH_PATHS.has(path)) {
    await refreshSession();
  }
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetchWithWake(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });

  // Expired or missing access token: refresh once, retry once. If the refresh is rejected,
  // refreshSession() has already told the app the session is gone.
  if (res.status === 401 && !isRetry && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) return request<T>(path, init, true);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details as Record<string, string[] | undefined> | undefined;
    const firstDetail = details ? Object.values(details).flat().find(Boolean) : undefined;
    throw new ApiError(res.status, firstDetail ?? data.error ?? `Request failed (${res.status})`, details);
  }
  return data as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; ai: { configured: boolean }; speech: { mode: string; pronunciation: { supported: boolean; note: string } } }>(
      "/health",
    ),

  me: () => request<{ user: UserDTO }>("/auth/me"),
  register: async (body: { username: string; email: string; password: string }) =>
    ({ user: setSession(await request<SessionResponse>("/auth/register", { body })) }),
  login: async (body: { identifier: string; password: string }) =>
    ({ user: setSession(await request<SessionResponse>("/auth/login", { body })) }),
  logout: async () => {
    try {
      await request<void>("/auth/logout", { body: {} });
    } finally {
      clearSession();
    }
  },

  onboarding: (body: {
    nativeLanguage: string;
    targetLanguage: string;
    level: string;
    acceptRules: boolean;
    transcriptionConsent: boolean;
  }) => request<{ user: UserDTO }>("/me/onboarding", { body }),
  updateSettings: (body: {
    nativeLanguage?: string;
    activeTargetLanguage?: string;
    privacy?: { transcriptionConsent?: boolean; retainTranscripts?: boolean };
  }) => request<{ user: UserDTO }>("/me/settings", { method: "PATCH", body }),
  setLanguage: (code: string, level: string) =>
    request<{ user: UserDTO }>(`/me/languages/${code}`, { method: "PUT", body: { level } }),
  removeLanguage: (code: string) => request<{ user: UserDTO }>(`/me/languages/${code}`, { method: "DELETE" }),
  profile: () => request<{ profile: ProfileStats }>("/me/profile"),
  blocked: () => request<{ blocked: { id: string; username: string }[] }>("/me/blocked"),
  unblock: (id: string) => request<void>(`/me/blocked/${id}`, { method: "DELETE" }),
  deleteAccount: async () => {
    await request<void>("/me", { method: "DELETE" });
    clearSession();
  },

  feedback: (conversationId: string) => request<{ feedback: FeedbackDTO }>(`/conversations/${conversationId}/feedback`),
  retryFeedback: (conversationId: string) =>
    request<{ ok: true }>(`/conversations/${conversationId}/feedback/retry`, { body: {} }),
  report: (conversationId: string, reason: string, details: string) =>
    request<{ ok: true }>(`/conversations/${conversationId}/report`, { body: { reason, details } }),
  block: (conversationId: string) => request<{ ok: true }>(`/conversations/${conversationId}/block`, { body: {} }),

  startAssessment: (targetLanguage: string) =>
    request<{ id: string; targetLanguage: string; questions: AssessmentQuestion[] }>("/assessment", {
      body: { targetLanguage },
    }),
  submitAssessment: (id: string, answers: { questionId: string; answer: string }[]) =>
    request<{ result: AssessmentResult }>(`/assessment/${id}/submit`, { body: { answers } }),
  applyAssessment: (id: string) => request<{ user: UserDTO }>(`/assessment/${id}/apply`, { body: {} }),
};
