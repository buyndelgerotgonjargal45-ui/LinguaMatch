import { REPORT_REASONS } from "@linguamatch/shared";
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    reason: { type: String, enum: REPORT_REASONS.map((r) => r.value), required: true },
    details: { type: String, maxlength: 1000, default: "" },
    status: { type: String, enum: ["open", "reviewed", "dismissed", "actioned"], default: "open" },
  },
  { timestamps: true },
);

ReportSchema.index({ reporterId: 1, conversationId: 1 }, { unique: true });

export type ReportAttrs = InferSchemaType<typeof ReportSchema>;
export const Report = mongoose.model("Report", ReportSchema);
