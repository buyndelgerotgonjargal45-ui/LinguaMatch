import { CEFR_LEVELS } from "@linguamatch/shared";
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const AssessmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetLanguage: { type: String, required: true },
    questions: {
      type: [{ id: String, prompt: String, focus: String, targetLevel: { type: String, enum: CEFR_LEVELS }, _id: false }],
      default: [],
    },
    answers: { type: [{ questionId: String, answer: String, _id: false }], default: [] },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    result: {
      level: { type: String, enum: [...CEFR_LEVELS, null], default: null },
      confidence: { type: String, enum: ["low", "medium", "high", null], default: null },
      rationale: { type: String, default: null },
      strengths: { type: [String], default: [] },
      areasToImprove: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

export type AssessmentAttrs = InferSchemaType<typeof AssessmentSchema>;
export const Assessment = mongoose.model("Assessment", AssessmentSchema);
