import type { NextFunction, Request, Response } from "express";
import { User, type UserDoc } from "../models/User";
import { AUTH_COOKIE, verifyToken } from "../utils/auth";
import { HttpError } from "../utils/http";

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

export function tokenFromRequest(req: Request): string | null {
  const cookie = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = verifyToken(tokenFromRequest(req));
  if (!userId) throw new HttpError(401, "Not signed in");
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, "Account not found");
  req.user = user;
  next();
}

/** Narrowing helper for handlers mounted behind requireAuth. */
export function currentUser(req: Request): UserDoc {
  if (!req.user) throw new HttpError(401, "Not signed in");
  return req.user;
}
