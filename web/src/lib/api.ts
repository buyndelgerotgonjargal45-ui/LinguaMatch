import type { AssessmentQuestion, AssessmentResult, FeedbackDTO, ProfileStats, UserDTO } from "@linguamatch/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "include",
  });
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
  register: (body: { username: string; email: string; password: string }) =>
    request<{ user: UserDTO }>("/auth/register", { body }),
  login: (body: { identifier: string; password: string }) => request<{ user: UserDTO }>("/auth/login", { body }),
  logout: () => request<void>("/auth/logout", { body: {} }),

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
  deleteAccount: () => request<void>("/me", { method: "DELETE" }),

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
