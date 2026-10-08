import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env";
import type { CookieOptions } from "express";

export const AUTH_COOKIE = "lm_session";

interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRES_IN_DAYS}d`,
  });
}

/** Returns the user id, or null for a missing/invalid/expired token. */
export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.JWT_EXPIRES_IN_DAYS * 24 * 3600 * 1000,
  };
}
