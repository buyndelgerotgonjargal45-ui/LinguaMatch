import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env";
import type { CookieOptions } from "express";

/**
 * Two tokens:
 * - access: short-lived, kept in the browser's memory, sent as `Authorization: Bearer` and in the
 *   Socket.IO handshake `auth`. Never stored in a cookie.
 * - refresh: long-lived, httpOnly cookie scoped to /api/auth. The web app reaches the API through
 *   its own domain (Next.js rewrite), so this cookie is first-party and works in Incognito.
 */
export const REFRESH_COOKIE = "lm_refresh";
/** Cookie used before access/refresh tokens existed; cleared so it can't linger. */
export const LEGACY_SESSION_COOKIE = "lm_session";

export type TokenType = "access" | "refresh";
export type AuthFailureReason = "missing" | "expired" | "invalid_signature" | "malformed" | "wrong_type" | "wrong_origin" | "unknown_user";

interface TokenPayload {
  sub: string;
  typ: TokenType;
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: AuthFailureReason };

export function signAccessToken(userId: string): { token: string; expiresAt: number } {
  const ttlSeconds = env.ACCESS_TOKEN_TTL_MINUTES * 60;
  const token = jwt.sign({ sub: userId, typ: "access" } satisfies TokenPayload, env.JWT_SECRET, { expiresIn: ttlSeconds });
  return { token, expiresAt: Date.now() + ttlSeconds * 1000 };
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: "refresh" } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

/** Verifies a token of the expected type and says why it was rejected. */
export function verifyToken(token: string | undefined | null, expected: TokenType): VerifyResult {
  if (!token) return { ok: false, reason: "missing" };
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Partial<TokenPayload>;
    if (typeof payload.sub !== "string") return { ok: false, reason: "malformed" };
    if (payload.typ !== expected) return { ok: false, reason: "wrong_type" };
    return { ok: true, userId: payload.sub };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: "expired" };
    if (err instanceof jwt.JsonWebTokenError && err.message === "invalid signature") return { ok: false, reason: "invalid_signature" };
    return { ok: false, reason: "malformed" };
  }
}

/** One log line per rejected request. Never pass tokens, cookies or secrets in `context`. */
export function logAuthFailure(channel: "http" | "socket", reason: AuthFailureReason, context: Record<string, string | undefined> = {}) {
  const extra = Object.entries(context)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.warn(`[auth] ${channel} rejected reason=${reason}${extra ? ` ${extra}` : ""}`);
}

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
  };
}
