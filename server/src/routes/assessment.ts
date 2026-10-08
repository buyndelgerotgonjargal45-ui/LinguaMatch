import { isTargetLanguage, type AssessmentQuestion, type CefrLevel } from "@linguamatch/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Types } from "mongoose";
import { z } from "zod";
import { currentUser, requireAuth } from "../middleware/auth";
import { Assessment } from "../models/Assessment";
import { toUserDTO } from "../models/User";
import { AIResponseError, AIUnavailableError, getAI } from "../services/ai";
import { HttpError, parseBody } from "../utils/http";

export const assessmentRouter = Router();
assessmentRouter.use(requireAuth);
const aiLimiter = rateLimit({ windowMs: 3600_000, limit: 10, standardHeaders: true, legacyHeaders: false });

function aiError(err: unknown): never {
  if (err instanceof AIUnavailableError) throw new HttpError(503, err.message);
  if (err instanceof AIResponseError) throw new HttpError(502, err.message);
  console.error("[assessment] AI call failed:", err);
  throw new HttpError(502, "The AI service is unavailable right now. Please try again.");
}

async function findOwn(id: string, userId: Types.ObjectId) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, "Assessment not found");
  const a = await Assessment.findOne({ _id: id, userId });
  if (!a) throw new HttpError(404, "Assessment not found");
  return a;
}

assessmentRouter.post("/", aiLimiter, async (req, res) => {
  const { targetLanguage } = parseBody(
    z.object({ targetLanguage: z.string().refine(isTargetLanguage, "Unsupported language") }),
    req.body,
  );
  const user = currentUser(req);
  let questions: AssessmentQuestion[];
  try {
    questions = await getAI().createAssessment({
      targetLanguage,
      nativeLanguage: user.nativeLanguage ?? null,
      selfReportedLevel: (user.targetLanguages.find((t) => t.language === targetLanguage)?.level as CefrLevel) ?? null,
    });
  } catch (err) {
    aiError(err);
  }
  const assessment = await Assessment.create({ userId: user._id, targetLanguage, questions });
  res.status(201).json({ id: assessment._id.toString(), targetLanguage, questions });
});

const SubmitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), answer: z.string().max(2000) })).max(10),
});

assessmentRouter.post("/:id/submit", aiLimiter, async (req, res) => {
  const { answers } = parseBody(SubmitSchema, req.body);
  const assessment = await findOwn(req.params.id as string, currentUser(req)._id);
  if (assessment.status === "completed") throw new HttpError(400, "This assessment was already submitted");
  if (answers.filter((a) => a.answer.trim()).length === 0) throw new HttpError(400, "Answer at least one question");

  const questions = assessment.questions.map((q) => ({
    id: q.id ?? "",
    prompt: q.prompt ?? "",
    focus: q.focus ?? "",
    targetLevel: q.targetLevel as CefrLevel,
  }));
  try {
    const result = await getAI().evaluateAssessment({ targetLanguage: assessment.targetLanguage, questions, answers });
    assessment.set("answers", answers);
    assessment.status = "completed";
    assessment.result = result;
    await assessment.save();
    res.json({ result });
  } catch (err) {
    aiError(err);
  }
});

/** Applies an AI-estimated level to the user's profile — only when the user chooses to. */
assessmentRouter.post("/:id/apply", async (req, res) => {
  const user = currentUser(req);
  const assessment = await findOwn(req.params.id as string, user._id);
  const level = assessment.result?.level;
  if (assessment.status !== "completed" || !level) throw new HttpError(400, "Assessment not completed");

  const existing = user.targetLanguages.find((t) => t.language === assessment.targetLanguage);
  if (existing) {
    existing.level = level;
    existing.levelSource = "assessment";
  } else {
    user.targetLanguages.push({ language: assessment.targetLanguage, level, levelSource: "assessment" });
  }
  user.activeTargetLanguage ??= assessment.targetLanguage;
  await user.save();
  res.json({ user: toUserDTO(user) });
});
