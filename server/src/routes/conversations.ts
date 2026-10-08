import { REPORT_REASONS } from "@linguamatch/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Types } from "mongoose";
import { z } from "zod";
import { currentUser, requireAuth } from "../middleware/auth";
import { ConversationFeedback } from "../models/ConversationFeedback";
import { generateConversationFeedback, toFeedbackDTO } from "../services/feedback/feedbackService";
import { blockPartner, reportPartner } from "../services/moderation/moderationService";
import { HttpError, parseBody } from "../utils/http";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

const ReportSchema = z.object({
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]),
  details: z.string().trim().max(1000).default(""),
});

conversationsRouter.post("/:id/report", rateLimit({ windowMs: 3600_000, limit: 20 }), async (req, res) => {
  const body = parseBody(ReportSchema, req.body);
  await reportPartner(currentUser(req)._id.toString(), req.params.id as string, body.reason as never, body.details);
  res.status(201).json({ ok: true });
});

conversationsRouter.post("/:id/block", async (req, res) => {
  await blockPartner(currentUser(req)._id.toString(), req.params.id as string);
  res.status(201).json({ ok: true });
});

/** The caller's own report only — a partner's feedback is never readable. */
conversationsRouter.get("/:id/feedback", async (req, res) => {
  const id = req.params.id as string;
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, "Not found");
  const feedback = await ConversationFeedback.findOne({ conversationId: id, userId: currentUser(req)._id });
  if (!feedback) throw new HttpError(404, "No feedback for this conversation yet");
  res.json({ feedback: await toFeedbackDTO(feedback) });
});

conversationsRouter.post("/:id/feedback/retry", rateLimit({ windowMs: 600_000, limit: 5 }), async (req, res) => {
  const id = req.params.id as string;
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, "Not found");
  const feedback = await ConversationFeedback.findOne({ conversationId: id, userId: currentUser(req)._id });
  if (!feedback) throw new HttpError(404, "Not found");
  if (feedback.status !== "failed") throw new HttpError(400, "Only failed reports can be retried");
  feedback.status = "pending";
  feedback.statusMessage = null;
  await feedback.save();
  void generateConversationFeedback(id);
  res.status(202).json({ ok: true });
});
