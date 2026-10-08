import { CEFR_LEVELS } from "@linguamatch/shared";
import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Durable record of each queue entry. The live matching set is held in memory by the
 * matchmaking service (single-process MVP); this collection is the audit trail and the
 * source of truth for "who is waiting" if the process restarts.
 */
const MatchQueueSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    nativeLanguage: { type: String, default: null },
    targetLanguage: { type: String, required: true, index: true },
    level: { type: String, enum: CEFR_LEVELS, required: true },
    status: { type: String, enum: ["waiting", "matched", "cancelled", "expired"], default: "waiting", index: true },
    matchedWith: { type: Schema.Types.ObjectId, ref: "User", default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", default: null },
    levelDistance: { type: Number, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Keep finished entries for a week for debugging matchmaking, then let MongoDB drop them.
MatchQueueSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export type MatchQueueAttrs = InferSchemaType<typeof MatchQueueSchema>;
export const MatchQueue = mongoose.model("MatchQueue", MatchQueueSchema);
