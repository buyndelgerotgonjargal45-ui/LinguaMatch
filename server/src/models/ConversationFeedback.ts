import { CEFR_LEVELS } from "@linguamatch/shared";
import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

const MistakeSchema = new Schema(
  {
    category: { type: String, enum: ["grammar", "vocabulary", "sentence_structure", "word_choice"] },
    original: String,
    corrected: String,
    explanation: String,
  },
  { _id: false },
);

const ConversationFeedbackSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "ready", "insufficient_data", "no_consent", "failed"],
      default: "pending",
    },
    statusMessage: { type: String, default: null },

    targetLanguage: { type: String, required: true },
    level: { type: String, enum: CEFR_LEVELS, required: true },
    estimatedPerformance: { type: String, default: null },

    grammarScore: { type: Number, default: null },
    vocabularyScore: { type: Number, default: null },
    fluencyScore: { type: Number, default: null },
    pronunciationScore: { type: Number, default: null },
    pronunciationNote: { type: String, default: null },
    overallScore: { type: Number, default: null },

    summary: { type: String, default: null },
    mistakes: { type: [MistakeSchema], default: [] },
    /** Flat original→corrected pairs, kept alongside `mistakes` for quick querying. */
    corrections: { type: [{ original: String, corrected: String, _id: false }], default: [] },
    vocabularySuggestions: {
      type: [{ original: String, alternatives: [String], note: String, _id: false }],
      default: [],
    },
    fluencyNotes: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    exercises: {
      type: [{ title: String, instructions: String, items: [String], answerKey: [String], _id: false }],
      default: [],
    },
    metrics: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

ConversationFeedbackSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export type ConversationFeedbackAttrs = InferSchemaType<typeof ConversationFeedbackSchema>;
export type ConversationFeedbackDoc = HydratedDocument<ConversationFeedbackAttrs>;
export const ConversationFeedback = mongoose.model("ConversationFeedback", ConversationFeedbackSchema);
