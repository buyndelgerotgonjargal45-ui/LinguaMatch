import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { currentUser, requireAuth } from "../middleware/auth";
import { User, toUserDTO } from "../models/User";
import { AUTH_COOKIE, authCookieOptions, signToken } from "../utils/auth";
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
  res.cookie(AUTH_COOKIE, signToken(user._id.toString()), authCookieOptions());
  res.status(201).json({ user: toUserDTO(user) });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const body = parseBody(LoginSchema, req.body);
  const user = await User.findOne(
    body.identifier.includes("@")
      ? { email: body.identifier.toLowerCase() }
      : { username: new RegExp(`^${body.identifier.replace(/[^a-zA-Z0-9_]/g, "")}$`, "i") },
  ).select("+passwordHash");
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect username/email or password");
  }
  res.cookie(AUTH_COOKIE, signToken(user._id.toString()), authCookieOptions());
  res.json({ user: toUserDTO(user) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: toUserDTO(currentUser(req)) });
});
