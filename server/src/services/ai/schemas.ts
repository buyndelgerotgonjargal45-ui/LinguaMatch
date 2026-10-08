import { CEFR_LEVELS } from "@linguamatch/shared";
import { z } from "zod";

// Structured-output schemas. Numeric ranges are enforced after parsing (see clampScore)
// because JSON-schema range constraints are not guaranteed by the structured-output mode.

export const TopicSchema = z.object({
  title: z.string().describe("Short, engaging topic title in the target language"),
  description: z.string().describe("One or two sentences framing the topic, in the target language"),
  questions: z.array(z.string()).describe("2 to 4 follow-up questions in the target language"),
});

export const AssessmentQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      prompt: z.string().describe("The question shown to the learner, in the target language"),
      focus: z.string().describe("What skill this probes, in English"),
      targetLevel: z.enum(CEFR_LEVELS),
    }),
  ),
});

export const AssessmentResultSchema = z.object({
  level: z.enum(CEFR_LEVELS),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
  strengths: z.array(z.string()),
  areasToImprove: z.array(z.string()),
});

export const ConversationAnalysisSchema = z.object({
  estimatedPerformance: z
    .string()
    .describe('CEFR level demonstrated in this conversation, optionally with + or -, e.g. "B1+"'),
  grammarScore: z.number().int().describe("0-100, relative to the learner's stated level"),
  vocabularyScore: z.number().int().describe("0-100, relative to the learner's stated level"),
  fluencyScore: z.number().int().describe("0-100, relative to the learner's stated level"),
  summary: z.string().describe("2-3 sentence overall summary addressed to the learner"),
  mistakes: z.array(
    z.object({
      category: z.enum(["grammar", "vocabulary", "sentence_structure", "word_choice"]),
      original: z.string().describe("Exact words the learner said, quoted from the transcript"),
      corrected: z.string(),
      explanation: z.string().describe("One short sentence explaining why"),
    }),
  ),
  vocabularySuggestions: z.array(
    z.object({
      original: z.string(),
      alternatives: z.array(z.string()),
      note: z.string(),
    }),
  ),
  fluencyNotes: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  exercises: z.array(
    z.object({
      title: z.string(),
      instructions: z.string(),
      items: z.array(z.string()),
      answerKey: z.array(z.string()),
    }),
  ),
});

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
