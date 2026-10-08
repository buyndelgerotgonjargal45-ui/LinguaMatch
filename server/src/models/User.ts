import { CEFR_LEVELS, type UserDTO } from "@linguamatch/shared";
import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Types } from "mongoose";

const LanguageProfileSchema = new Schema(
  {
    language: { type: String, required: true },
    level: { type: String, enum: CEFR_LEVELS, required: true },
    levelSource: { type: String, enum: ["self", "assessment"], default: "self" },
    estimatedPerformance: { type: String, default: null },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

    nativeLanguage: { type: String, default: null },
    targetLanguages: { type: [LanguageProfileSchema], default: [] },
    activeTargetLanguage: { type: String, default: null },

    statistics: {
      conversations: { type: Number, default: 0 },
      practiceSeconds: { type: Number, default: 0 },
      scoredConversations: { type: Number, default: 0 },
      scoreSum: { type: Number, default: 0 },
    },

    privacy: {
      transcriptionConsent: { type: Boolean, default: false },
      retainTranscripts: { type: Boolean, default: false },
    },

    rulesAcceptedAt: { type: Date, default: null },
    blockedUsers: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    /** Most recent partners first; used to avoid repeated matches. */
    recentPartners: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },

    moderation: {
      status: { type: String, enum: ["active", "suspended", "banned"], default: "active" },
      suspendedUntil: { type: Date, default: null },
      reason: { type: String, default: null },
    },
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof UserSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = mongoose.model("User", UserSchema);

export function isOnboarded(user: Pick<UserAttrs, "nativeLanguage" | "targetLanguages" | "activeTargetLanguage" | "rulesAcceptedAt">) {
  return Boolean(user.nativeLanguage && user.activeTargetLanguage && user.targetLanguages.length && user.rulesAcceptedAt);
}

export function activeLanguageProfile(user: Pick<UserAttrs, "targetLanguages" | "activeTargetLanguage">, language?: string) {
  const code = language ?? user.activeTargetLanguage;
  return user.targetLanguages.find((t) => t.language === code) ?? null;
}

export function isSuspended(user: Pick<UserAttrs, "moderation">): boolean {
  const m = user.moderation;
  if (!m) return false;
  if (m.status === "banned") return true;
  return m.status === "suspended" && !!m.suspendedUntil && m.suspendedUntil.getTime() > Date.now();
}

export function toUserDTO(user: UserDoc): UserDTO {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    nativeLanguage: user.nativeLanguage ?? null,
    targetLanguages: user.targetLanguages.map((t) => ({
      language: t.language,
      level: t.level as UserDTO["targetLanguages"][number]["level"],
      levelSource: (t.levelSource ?? "self") as "self" | "assessment",
      estimatedPerformance: t.estimatedPerformance ?? null,
    })),
    activeTargetLanguage: user.activeTargetLanguage ?? null,
    privacy: {
      transcriptionConsent: user.privacy?.transcriptionConsent ?? false,
      retainTranscripts: user.privacy?.retainTranscripts ?? false,
    },
    rulesAcceptedAt: user.rulesAcceptedAt?.toISOString() ?? null,
    onboarded: isOnboarded(user),
  };
}

export type UserId = Types.ObjectId;
