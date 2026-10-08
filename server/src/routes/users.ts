import { CEFR_LEVELS, isNativeLanguage, isTargetLanguage } from "@linguamatch/shared";
import { Router } from "express";
import { z } from "zod";
import { currentUser, requireAuth } from "../middleware/auth";
import { Assessment } from "../models/Assessment";
import { Conversation } from "../models/Conversation";
import { ConversationFeedback } from "../models/ConversationFeedback";
import { User, toUserDTO } from "../models/User";
import { matchmaker } from "../socket";
import { unblockUser } from "../services/moderation/moderationService";
import { buildProfileStats } from "../services/profile/profileService";
import { AUTH_COOKIE, authCookieOptions } from "../utils/auth";
import { HttpError, parseBody } from "../utils/http";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const nativeLanguage = z.string().refine(isNativeLanguage, "Unsupported language");
const targetLanguage = z.string().refine(isTargetLanguage, "Unsupported language");

const OnboardingSchema = z.object({
  nativeLanguage,
  targetLanguage,
  level: z.enum(CEFR_LEVELS),
  acceptRules: z.literal(true, { error: "You must accept the community rules" }),
  transcriptionConsent: z.boolean(),
});

usersRouter.post("/onboarding", async (req, res) => {
  const body = parseBody(OnboardingSchema, req.body);
  if (body.nativeLanguage === body.targetLanguage) {
    throw new HttpError(400, "Pick a target language different from your native language");
  }
  const user = currentUser(req);
  user.nativeLanguage = body.nativeLanguage;
  const existing = user.targetLanguages.find((t) => t.language === body.targetLanguage);
  if (existing) {
    existing.level = body.level;
    existing.levelSource = "self";
  } else {
    user.targetLanguages.push({ language: body.targetLanguage, level: body.level, levelSource: "self" });
  }
  user.activeTargetLanguage = body.targetLanguage;
  user.rulesAcceptedAt ??= new Date();
  user.privacy!.transcriptionConsent = body.transcriptionConsent;
  await user.save();
  res.json({ user: toUserDTO(user) });
});

const SettingsSchema = z.object({
  nativeLanguage: nativeLanguage.optional(),
  activeTargetLanguage: targetLanguage.optional(),
  privacy: z
    .object({ transcriptionConsent: z.boolean().optional(), retainTranscripts: z.boolean().optional() })
    .optional(),
});

usersRouter.patch("/settings", async (req, res) => {
  const body = parseBody(SettingsSchema, req.body);
  const user = currentUser(req);
  if (body.nativeLanguage) user.nativeLanguage = body.nativeLanguage;
  if (body.activeTargetLanguage) {
    if (!user.targetLanguages.some((t) => t.language === body.activeTargetLanguage)) {
      throw new HttpError(400, "Add that language first");
    }
    user.activeTargetLanguage = body.activeTargetLanguage;
  }
  if (body.privacy?.transcriptionConsent !== undefined) user.privacy!.transcriptionConsent = body.privacy.transcriptionConsent;
  if (body.privacy?.retainTranscripts !== undefined) user.privacy!.retainTranscripts = body.privacy.retainTranscripts;
  await user.save();
  res.json({ user: toUserDTO(user) });
});

usersRouter.put("/languages/:code", async (req, res) => {
  const code = req.params.code;
  if (!isTargetLanguage(code)) throw new HttpError(400, "Unsupported language");
  const { level } = parseBody(z.object({ level: z.enum(CEFR_LEVELS) }), req.body);
  const user = currentUser(req);
  if (code === user.nativeLanguage) throw new HttpError(400, "That's your native language");
  const existing = user.targetLanguages.find((t) => t.language === code);
  if (existing) {
    existing.level = level;
    existing.levelSource = "self";
  } else {
    user.targetLanguages.push({ language: code, level, levelSource: "self" });
  }
  user.activeTargetLanguage ??= code;
  await user.save();
  res.json({ user: toUserDTO(user) });
});

usersRouter.delete("/languages/:code", async (req, res) => {
  const user = currentUser(req);
  if (user.targetLanguages.length <= 1) throw new HttpError(400, "Keep at least one language");
  user.targetLanguages.pull({ language: req.params.code });
  if (user.activeTargetLanguage === req.params.code) user.activeTargetLanguage = user.targetLanguages[0]?.language ?? null;
  await user.save();
  res.json({ user: toUserDTO(user) });
});

usersRouter.get("/profile", async (req, res) => {
  res.json({ profile: await buildProfileStats(currentUser(req)) });
});

usersRouter.get("/blocked", async (req, res) => {
  const user = await User.findById(currentUser(req)._id).populate<{ blockedUsers: { _id: unknown; username: string }[] }>(
    "blockedUsers",
    "username",
  );
  res.json({ blocked: (user?.blockedUsers ?? []).map((b) => ({ id: String(b._id), username: b.username })) });
});

usersRouter.delete("/blocked/:id", async (req, res) => {
  await unblockUser(currentUser(req)._id.toString(), req.params.id);
  res.status(204).end();
});

/** Deletes the account and everything personal tied to it. */
usersRouter.delete("/", async (req, res) => {
  const user = currentUser(req);
  await matchmaker.leave(user._id.toString());
  await Promise.all([
    ConversationFeedback.deleteMany({ userId: user._id }),
    Assessment.deleteMany({ userId: user._id }),
    Conversation.updateMany(
      { "participants.userId": user._id },
      { $set: { "participants.$[p].displayName": "Deleted user", transcript: [], transcriptPurgedAt: new Date() } },
      { arrayFilters: [{ "p.userId": user._id }] },
    ),
    User.updateMany({}, { $pull: { blockedUsers: user._id, recentPartners: user._id } }),
  ]);
  await user.deleteOne();
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.status(204).end();
});
