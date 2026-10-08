import bcrypt from "bcryptjs";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { currentUser, requireAuth } from "../middleware/auth";
import { User, toUserDTO, type UserDoc } from "../models/User";
import {
  LEGACY_SESSION_COOKIE,
  REFRESH_COOKIE,
  logAuthFailure,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../utils/auth";
import { HttpError, parseBody } from "../utils/http";

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only"),
  email: z.email().max(254),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

/** Sets (or rotates) the refresh cookie and returns the body every session endpoint sends. */
function startSession(res: Response, user: UserDoc) {
  const userId = user._id.toString();
  res.cookie(REFRESH_COOKIE, signRefreshToken(userId), refreshCookieOptions());
  res.clearCookie(LEGACY_SESSION_COOKIE, { path: "/" });
  const access = signAccessToken(userId);
  return { user: toUserDTO(user), accessToken: access.token, accessTokenExpiresAt: access.expiresAt };
}

export function clearSession(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.clearCookie(LEGACY_SESSION_COOKIE, { path: "/" });
}

const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const body = parseBody(RegisterSchema, req.body);
  const exists = await User.findOne({
    $or: [{ email: body.email.toLowerCase() }, { username: new RegExp(`^${body.username}$`, "i") }],
  });
  if (exists) throw new HttpError(409, "That username or email is already taken");

  const user = await User.create({
    username: body.username,
    email: body.email,
    passwordHash: await bcrypt.hash(body.password, 12),
  });
  res.status(201).json(startSession(res, user));
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const body = parseBody(LoginSchema, req.body);
  const user = await User.findOne(
    body.identifier.includes("@")
      ? { email: body.identifier.toLowerCase() }
      : { username: new RegExp(`^${body.identifier.replace(/[^a-zA-Z0-9_]/g, "")}$`, "i") },
  ).select("+passwordHash");
  // A record without a hash (e.g. legacy data) must fail like a wrong password, not crash bcrypt.
  if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect username/email or password");
  }
  res.json(startSession(res, user));
});

/** Exchanges the refresh cookie for a new access token and rotates the cookie (sliding expiry). */
authRouter.post("/refresh", async (req, res) => {
  const result = verifyToken(req.cookies?.[REFRESH_COOKIE] as string | undefined, "refresh");
  if (!result.ok) {
    // "missing" is the normal signed-out page load; only log real failures.
    if (result.reason !== "missing") logAuthFailure("http", result.reason, { path: "/api/auth/refresh" });
    clearSession(res);
    throw new HttpError(401, "Not signed in");
  }
  const user = await User.findById(result.userId);
  if (!user) {
    logAuthFailure("http", "unknown_user", { path: "/api/auth/refresh" });
    clearSession(res);
    throw new HttpError(401, "Account not found");
  }
  res.json(startSession(res, user));
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: toUserDTO(currentUser(req)) });
});
