import { CEFR_LEVELS } from "@linguamatch/shared";
import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const ParticipantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    displayName: { type: String, required: true },
    nativeLanguage: { type: String, default: null },
    level: { type: String, enum: CEFR_LEVELS, required: true },
    transcriptionConsent: { type: Boolean, default: false },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
  },
  { _id: false },
);

const TopicSchema = new Schema(
  {
    title: String,
    description: String,
    questions: [String],
    level: { type: String, enum: CEFR_LEVELS },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** Text only — LinguaMatch never records or stores audio/video. */
const TranscriptSegmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 2000 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    confidence: { type: Number, default: null },
  },
  { _id: false },
);

const ConversationSchema = new Schema(
  {
    participants: { type: [ParticipantSchema], required: true },
    targetLanguage: { type: String, required: true },
    topics: { type: [TopicSchema], default: [] },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    transcript: { type: [TranscriptSegmentSchema], default: [], select: false },
    transcriptPurgedAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "ended"], default: "active", index: true },
    endReason: { type: String, default: null },
    endedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ConversationSchema.index({ "participants.userId": 1, startTime: -1 });

export type ConversationAttrs = InferSchemaType<typeof ConversationSchema>;
export type ConversationDoc = HydratedDocument<ConversationAttrs>;
export const Conversation = mongoose.model("Conversation", ConversationSchema);

export function conversationDurationSeconds(c: Pick<ConversationAttrs, "startTime" | "endTime">): number {
  const end = c.endTime ?? new Date();
  return Math.max(0, Math.round((end.getTime() - c.startTime.getTime()) / 1000));
}
